from flask import request

def handler():
    # Get the request headers
    headers = request.headers

    # Modify the headers
    headers["User-Agent"] = "Boltic Serverless"

    # Return a response (you can return whatever response you need)
    return "Modified Headers", 200, headers
