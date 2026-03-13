import psycopg
from fastapi import HTTPException, status
from psycopg.errors import UniqueViolation
from psycopg.rows import dict_row

from ..database import get_connection
from ..schemas import ActionResponse, CreateAccountResponse, LoginInput, LoginResponse, RegisterStudentInput, UpdateProfileInput, UpdateProfileResponse
from ..security import hash_password, verify_password


def create_account(payload: RegisterStudentInput, role: str) -> CreateAccountResponse:
  name = payload.name.strip()
  email = payload.email.strip().lower()
  password_hash = hash_password(payload.password)

  if not name:
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Name is required.")

  try:
    with get_connection(dict_row) as connection:
      with connection.cursor() as cursor:
        cursor.execute(
          """
          INSERT INTO app_users (name, email, role, password_hash)
          VALUES (%s, %s, %s, %s)
          RETURNING id::text AS id, name, email, role;
          """,
          (name, email, role, password_hash),
        )
        created_user = cursor.fetchone()
      connection.commit()
  except UniqueViolation as error:
    raise HTTPException(
      status_code=status.HTTP_409_CONFLICT,
      detail="Email is already registered.",
    ) from error
  except psycopg.OperationalError as error:
    raise HTTPException(
      status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
      detail="Database is unavailable.",
    ) from error
  except psycopg.Error as error:
    raise HTTPException(
      status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
      detail="Unable to create account.",
    ) from error

  return CreateAccountResponse(success=True, user=created_user)


def login_account(payload: LoginInput) -> LoginResponse:
  email = payload.email.strip().lower()
  password = payload.password

  if not email or not password:
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email and password are required.")

  try:
    with get_connection(dict_row) as connection:
      with connection.cursor() as cursor:
        cursor.execute(
          """
          SELECT id::text AS id, name, email, role, avatar_url, password_hash
          FROM app_users
          WHERE email = %s;
          """,
          (email,),
        )
        user_row = cursor.fetchone()
  except psycopg.OperationalError as error:
    raise HTTPException(
      status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
      detail="Database is unavailable.",
    ) from error
  except psycopg.Error as error:
    raise HTTPException(
      status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
      detail="Unable to log in.",
    ) from error

  if not user_row or not verify_password(password, user_row.get("password_hash")):
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password.")

  user = {
    "id": user_row["id"],
    "name": user_row["name"],
    "email": user_row["email"],
    "role": user_row["role"],
  }
  avatar_url = user_row.get("avatar_url")
  if avatar_url:
    user["avatar"] = avatar_url

  return LoginResponse(
    success=True,
    user=user,
  )


def update_profile(user_id: str, payload: UpdateProfileInput) -> UpdateProfileResponse:
  normalized_user_id = user_id.strip()
  if not normalized_user_id:
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="User ID is required.")

  name = payload.name.strip()
  email = payload.email.strip().lower()
  avatar_url = payload.avatar.strip() if payload.avatar else None
  if not name or not email:
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Name and email are required.")

  wants_password_change = payload.currentPassword is not None or payload.newPassword is not None
  if wants_password_change:
    if not payload.currentPassword or not payload.newPassword:
      raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="Current and new passwords are required to change your password.",
      )
    if payload.currentPassword == payload.newPassword:
      raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="New password must be different from the current password.",
      )

  try:
    with get_connection(dict_row) as connection:
      with connection.cursor() as cursor:
        cursor.execute(
          """
          SELECT id::text AS id, password_hash
          FROM app_users
          WHERE id::text = %s;
          """,
          (normalized_user_id,),
        )
        existing_user = cursor.fetchone()
        if not existing_user:
          raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")

        next_password_hash = None
        if wants_password_change:
          if not verify_password(payload.currentPassword, existing_user.get("password_hash")):
            raise HTTPException(
              status_code=status.HTTP_401_UNAUTHORIZED,
              detail="Current password is incorrect.",
            )
          next_password_hash = hash_password(payload.newPassword)

        cursor.execute(
          """
          SELECT id
          FROM app_users
          WHERE email = %s AND id::text <> %s;
          """,
          (email, normalized_user_id),
        )
        if cursor.fetchone():
          raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email is already in use.")

        cursor.execute(
          """
          UPDATE app_users
          SET name = %s,
              email = %s,
              avatar_url = %s,
              password_hash = COALESCE(%s, password_hash),
              updated_at = NOW()
          WHERE id::text = %s
          RETURNING id::text AS id, name, email, role, avatar_url;
          """,
          (name, email, avatar_url, next_password_hash, normalized_user_id),
        )
        updated_user = cursor.fetchone()
      connection.commit()
  except HTTPException:
    raise
  except psycopg.OperationalError as error:
    raise HTTPException(
      status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
      detail="Database is unavailable.",
    ) from error
  except psycopg.Error as error:
    raise HTTPException(
      status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
      detail="Unable to update profile.",
    ) from error

  if not updated_user:
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")

  user_payload = {
    "id": updated_user["id"],
    "name": updated_user["name"],
    "email": updated_user["email"],
    "role": updated_user["role"],
  }
  if updated_user.get("avatar_url"):
    user_payload["avatar"] = updated_user["avatar_url"]

  message = "Profile updated."
  if wants_password_change:
    message = "Profile and password updated."

  return UpdateProfileResponse(success=True, user=user_payload, message=message)


def delete_admin_account(user_id: str) -> ActionResponse:
  normalized_user_id = user_id.strip()
  if not normalized_user_id:
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="User ID is required.")

  try:
    with get_connection(dict_row) as connection:
      with connection.cursor() as cursor:
        cursor.execute(
          """
          SELECT id::text AS id, name, role
          FROM app_users
          WHERE id::text = %s;
          """,
          (normalized_user_id,),
        )
        user_row = cursor.fetchone()
        if not user_row:
          raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Admin account not found.")

        if user_row.get("role") != "Admin":
          raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="User is not an admin.")

        cursor.execute(
          """
          SELECT COUNT(*) AS total_admins
          FROM app_users
          WHERE role = 'Admin';
          """,
        )
        total_admins_row = cursor.fetchone() or {}
        total_admins = int(total_admins_row.get("total_admins") or 0)
        if total_admins <= 1:
          raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot delete the last admin account.")

        cursor.execute(
          """
          DELETE FROM app_users
          WHERE id::text = %s
          RETURNING id::text AS id, name;
          """,
          (normalized_user_id,),
        )
        deleted_row = cursor.fetchone()
      connection.commit()
  except HTTPException:
    raise
  except psycopg.OperationalError as error:
    raise HTTPException(
      status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
      detail="Database is unavailable.",
    ) from error
  except psycopg.Error as error:
    raise HTTPException(
      status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
      detail="Unable to delete admin account.",
    ) from error

  if not deleted_row:
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Admin account not found.")

  return ActionResponse(success=True, message=f"Deleted {deleted_row['name']} admin account.")
