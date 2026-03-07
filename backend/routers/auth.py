from fastapi import APIRouter, status

from ..schemas import CreateAccountResponse, LoginInput, LoginResponse, RegisterStudentInput
from ..services.auth_service import create_account, login_account

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
