import socket

def handler(request):
    # Extract domain from the payload
    request_body = request.get_json(force=True, silent=True)
    domain = request_body.get("domain").split("//")[-1]  # Remove any scheme (e.g., "http://") if present
    if not domain:
        return {"error": "Domain not provided in request body"}

    reachable = False
    # Check if domain is reachable
    try:
        ip_address = socket.gethostbyname(domain)  # Resolve domain to IP address
        reachable = True
        # Get DNS statistics
        dns_stats = {}
        dns_stats["canonical_name"] = socket.gethostbyaddr(ip_address)[0]  # Get canonical name
        dns_stats["aliases"] = socket.gethostbyaddr(ip_address)[1]  # Get list of aliases
        dns_stats["ip_addresses"] = socket.gethostbyaddr(ip_address)[2]  # Get list of IP addresses
    except Exception as e:
        # If an exception occurs, the domain is not reachable
        reachable = False
        # Provide information about the DNS error
        dns_stats = {"error": "DNS statistics not available", "exception": str(e)}

    # Construct and return response
    return {"domain": domain, "reachable": reachable, "dns_stats": dns_stats}
