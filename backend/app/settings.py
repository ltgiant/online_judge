import os #.env 경로 찾기용
from pydantic_settings import BaseSettings, SettingsConfigDict #.env 읽어주는 라이브러리

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__))) #지금 파일의 2단계 부모

class Settings(BaseSettings):
    DATABASE_URL: str = "sqlite:///./dev.db"  # 초기엔 sqlite로 시작 가능
    REDIS_URL: str = "redis://localhost:6379/0"  # 나중에 Celery(비동기 채점 큐)에서 사용
    FILES_DIR: str = "./files"                 # 제출/케이스 저장 경로
    ALLOW_ORIGINS: list[str] = ["http://localhost:3000"]

    model_config = SettingsConfigDict(env_file=os.path.join(BASE_DIR, ".env")) # backend/.env

settings = Settings()

if __name__ == "__main__":
    print(settings.DATABASE_URL)
    print(settings.REDIS_URL)
    print(settings.FILES_DIR)
    print(settings.ALLOW_ORIGINS)