import os

os.environ.setdefault("DATABASE_URL", "postgresql://orb:orb@localhost:5432/orb")
os.environ.setdefault("AUTH_DISABLED", "true")
