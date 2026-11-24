"""Course and subject catalogue. Kiosk sees only permitted courses."""

from fastapi import APIRouter, Depends, status

from app.core.auth import require_authenticated, require_teacher
from app.core.errors import AppError
from app.core.security import verify_token
from app.models.schemas import CourseCreate, CourseInfo, SubjectCreate, SubjectInfo
from app.services.dependencies import get_repository
from app.services.repository import Repository

router = APIRouter(prefix="/api/v1/courses", tags=["courses"], dependencies=[Depends(verify_token)])


@router.get("", response_model=list[CourseInfo])
def list_courses(
    principal=Depends(require_authenticated),
    repository: Repository = Depends(get_repository),
) -> list[CourseInfo]:
    courses = repository.list_courses()
    if principal.course_ids is not None:
        courses = [course for course in courses if course["id"] in principal.course_ids]
    return [CourseInfo(**course) for course in courses]


@router.post("", response_model=CourseInfo, status_code=status.HTTP_201_CREATED)
def create_course(
    request: CourseCreate,
    _teacher=Depends(require_teacher),
    repository: Repository = Depends(get_repository),
) -> CourseInfo:
    if repository.get_course(request.id) is not None:
        raise AppError("course_exists", "Course already exists", 409)
    repository.create_course(request.id, request.name)
    return CourseInfo(**repository.get_course(request.id))  # type: ignore[arg-type]


@router.get("/{course_id}/subjects", response_model=list[SubjectInfo])
def list_subjects(
    course_id: str,
    principal=Depends(require_authenticated),
    repository: Repository = Depends(get_repository),
) -> list[SubjectInfo]:
    if principal.course_ids is not None and course_id not in principal.course_ids:
        raise AppError("forbidden", "Course is not permitted for this kiosk", 403)
    if repository.get_course(course_id) is None:
        raise AppError("course_not_found", "Course not found", 404)
    return [SubjectInfo(**item) for item in repository.list_subjects(course_id)]


@router.post("/{course_id}/subjects", response_model=SubjectInfo, status_code=status.HTTP_201_CREATED)
def create_subject(
    course_id: str,
    request: SubjectCreate,
    _teacher=Depends(require_teacher),
    repository: Repository = Depends(get_repository),
) -> SubjectInfo:
    if repository.get_course(course_id) is None:
        raise AppError("course_not_found", "Course not found", 404)
    if any(item["id"] == request.id for item in repository.list_subjects(course_id)):
        raise AppError("subject_exists", "Subject already exists", 409)
    repository.create_subject(course_id, request.id, request.name)
    return SubjectInfo(id=request.id, course_id=course_id, name=request.name, active=True)
