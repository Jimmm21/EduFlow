from fastapi import APIRouter, File, Request, UploadFile, status

from ..schemas import (
  ActionResponse,
  AssetUploadResponse,
  CreateAccountResponse,
  LoginInput,
  LoginResponse,
  RegisterStudentInput,
  UpdateProfileInput,
  UpdateProfileResponse,
)
from ..services.auth_service import create_account, delete_admin_account, login_account, update_profile
from ..services import upload_service

router = APIRouter()


@router.post(
  "/api/auth/register",
  response_model=CreateAccountResponse,
  status_code=status.HTTP_201_CREATED,
)
def register_student(payload: RegisterStudentInput) -> CreateAccountResponse:
  return create_account(payload, role="Student")


@router.post(
  "/api/auth/login",
  response_model=LoginResponse,
  status_code=status.HTTP_200_OK,
)
def login_student(payload: LoginInput) -> LoginResponse:
  return login_account(payload)


@router.post(
  "/api/admin/register",
  response_model=CreateAccountResponse,
  status_code=status.HTTP_201_CREATED,
)
def register_admin(payload: RegisterStudentInput) -> CreateAccountResponse:
  return create_account(payload, role="Admin")


@router.post(
  "/api/uploads/avatar",
  response_model=AssetUploadResponse,
  status_code=status.HTTP_201_CREATED,
)
async def upload_avatar_image(request: Request, file: UploadFile = File(...)) -> AssetUploadResponse:
  asset = await upload_service.save_avatar_image(file, str(request.base_url))
  return AssetUploadResponse(success=True, asset=asset)


@router.patch(
  "/api/users/{user_id}/profile",
  response_model=UpdateProfileResponse,
  status_code=status.HTTP_200_OK,
)
def update_user_profile(user_id: str, payload: UpdateProfileInput) -> UpdateProfileResponse:
  return update_profile(user_id, payload)


@router.delete(
  "/api/admin/users/{user_id}",
  response_model=ActionResponse,
  status_code=status.HTTP_200_OK,
)
def remove_admin_user(user_id: str) -> ActionResponse:
  return delete_admin_account(user_id)
