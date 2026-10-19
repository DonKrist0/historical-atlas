"""Create an editor or reset their password: python -m app.manage_editor LOGIN."""

import argparse
from getpass import getpass

from sqlalchemy import delete, select

from app.auth import hash_password
from app.database import SessionLocal
from app.models import Editor, EditorSession


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("username")
    parser.add_argument(
        "--disable", action="store_true", help="Disable account and revoke sessions"
    )
    args = parser.parse_args()
    username = args.username.strip().lower()
    if not username or len(username) > 100:
        parser.error("Логин должен содержать от 1 до 100 символов.")
    with SessionLocal() as session:
        editor = session.scalar(select(Editor).where(Editor.username == username))
        if args.disable:
            if not editor:
                parser.error("Редактор не найден.")
            editor.is_active = False
        else:
            password = getpass("Пароль (минимум 12 символов): ")
            if len(password) < 12 or len(password) > 1024:
                parser.error("Пароль должен содержать от 12 до 1024 символов.")
            if password != getpass("Повторите пароль: "):
                parser.error("Пароли не совпадают.")
            if not editor:
                editor = Editor(username=username)
                session.add(editor)
            editor.password_hash = hash_password(password)
            editor.is_active = True
            editor.failed_attempts = 0
            editor.locked_until = None
        session.flush()
        session.execute(delete(EditorSession).where(EditorSession.editor_id == editor.id))
        session.commit()
    print("Редактор отключён." if args.disable else "Редактор сохранён. Старые сессии отозваны.")


if __name__ == "__main__":
    main()
