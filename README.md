# dementia server (Backend)

---

## 📋 Prerequisites
Make sure you have the following installed before starting:

**Python 3.12+**
```bash
python --version
```

## 🚀 Getting Started
1️⃣ Clone the repository
```bash
git xxxx
cd dementia_server_backend
```

2️⃣ Create a virtual environment
```bash
python -m venv .venv
```

Activate it:

Windows:
```bash
 .venv\Scripts\activate
```

macOS / Linux:
```bash
source venv/bin/activate
```

You should see (.venv) in your terminal.

3️⃣ Install dependencies
```bash
pip install --upgrade pip
pip install -r requirements.txt
```

4️⃣ Apply database migrations
```bash
python manage.py migrate
```
This sets up the local database.

5️⃣ Create an admin user
```bash
python manage.py createsuperuser
```
This allows access to the Django admin panel.

6️⃣ Run the development server
```bash
python manage.py runserver
```
The server will be available at:
http://127.0.0.1:8000/

Admin panel:
http://127.0.0.1:8000/admin

--------------------------------------------


# Dementia App (Frontend)

## 🧰 Tech Stack
- Node.js **v20+ (LTS recommended)**
- React (Vite)
- npm

---

## 📋 Prerequisites
Make sure you have the following installed before starting:

**Node.js v20+**
```bash
node --version
npm --version
```

If Node.js is not installed, download it from:
https://nodejs.org/

## 🚀 Getting Started

2️⃣ Navigate to the frontend folder
```bash
cd frontend
```

3️⃣ Install dependencies
```bash
npm install
```

4️⃣ Run the development server
```bash
npm run dev
```
The application will be available at:
http://localhost:5173/

## 🔗 Running With the Backend
If running the backend locally, start the backend server first:

Backend:
http://127.0.0.1:8000/

Then start the frontend using the steps above.

The frontend will communicate with the backend API while both servers are running locally.
