import sys
from pathlib import Path

# Add the project root (Backend) to sys.path
root_dir = Path(__file__).resolve().parent.parent
if str(root_dir) not in sys.path:
    sys.path.insert(0, str(root_dir))

from app.ui.upload_panel import render_upload_panel

# Execute the panel
render_upload_panel()