.log.entries |= map(
  .request.headers |= map(select(.name | ascii_downcase | IN("authorization", "cookie") | not))
  | .response.headers |= map(select(.name | ascii_downcase != "set-cookie"))
  | .request.cookies = [] | .response.cookies = [])
