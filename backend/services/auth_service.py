import psycopg
from fastapi import HTTPException, status
from psycopg.errors import UniqueViolation
from psycopg.rows import dict_row

from ..database import get_connection
from ..schemas import CreateAccountResponse, LoginInput, LoginResponse, RegisterStudentInput
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
