.PHONY: help install dev test build clean

PY := backend/.venv/bin/python

help:
	@echo "make install   Create the venv and install both dependency sets"
	@echo "make dev       Run the API (7731) and the web app (7732)"
	@echo "make test      Run the backend test suite and the frontend typecheck"
	@echo "make build     Produce a production frontend bundle"
	@echo "make clean     Remove virtualenv, node_modules and build output"

install:
	python3 -m venv backend/.venv
	$(PY) -m pip install --quiet --upgrade pip
	$(PY) -m pip install --quiet -r backend/requirements-dev.txt
	cd frontend && npm install

dev:
	./dev.sh

test:
	cd backend && .venv/bin/python -m pytest -q
	cd frontend && npx tsc --noEmit

build:
	cd frontend && npm run build

clean:
	rm -rf backend/.venv backend/.pytest_cache frontend/node_modules frontend/dist
	find . -name __pycache__ -type d -prune -exec rm -rf {} +
