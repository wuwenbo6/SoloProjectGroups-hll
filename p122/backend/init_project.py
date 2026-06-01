import os
import sys

def create_structure():
    base = os.path.dirname(os.path.abspath(__file__))
    dirs = ['uploads', 'outputs', 'uploads/demo']
    for d in dirs:
        path = os.path.join(base, d)
        os.makedirs(path, exist_ok=True)
        print(f"  Created: {d}/")

if __name__ == '__main__':
    print("Initializing project structure...")
    create_structure()
    print("Done. Run 'cd backend && python app.py' to start the server.")
