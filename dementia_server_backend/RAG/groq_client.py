import os
from pathlib import Path

from dotenv import load_dotenv
from langchain_groq import ChatGroq


BACKEND_DIR = Path(__file__).resolve().parent.parent
PROJECT_ROOT = BACKEND_DIR.parent


class MissingGroqAPIKeyError(RuntimeError):
    """Raised when the backend cannot find a Groq API key."""


def _load_project_env() -> None:
    """Try the usual local env locations explicitly."""
    load_dotenv(BACKEND_DIR / ".env")
    load_dotenv(PROJECT_ROOT / ".env")
    load_dotenv()

    # DEBUG (temporary)
    print("ENV FILE LOADED FROM:", BACKEND_DIR / ".env")
    print("GROQ KEY EXISTS:", bool(os.getenv("GROQ_API_KEY")))


def get_groq_api_key() -> str:
    _load_project_env()

    api_key = os.getenv("GROQ_API_KEY", "").strip()
    if api_key:
        return api_key

    raise MissingGroqAPIKeyError(
        "Missing GROQ_API_KEY. Set it in your shell environment or add it to "
        f"{BACKEND_DIR / '.env'}."
    )


def build_chat_groq(model_name: str, **kwargs) -> ChatGroq:
    return ChatGroq(
        groq_api_key=get_groq_api_key(),
        model_name=model_name,
        **kwargs,
    )
