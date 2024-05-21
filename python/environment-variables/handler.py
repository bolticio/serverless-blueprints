import os

# Function to handle requests
def handler(request):
    return os.environ.get("FOO", "Specified environment variable is not set.")
