def handler(request):
    # Perform a permanent redirect
    return "", 301, {"Location": "https://www.boltic.io"}
