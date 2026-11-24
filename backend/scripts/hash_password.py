"""Generate a PBKDF2 password hash for backend/.env (no plaintext passwords stored)."""

import getpass
import sys

from app.core.auth import hash_password

if __name__ == "__main__":
    password = sys.argv[1] if len(sys.argv) > 1 else getpass.getpass("Teacher password: ")
    print(hash_password(password))
