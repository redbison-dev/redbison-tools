def scrub: .value = "REDACTED";
.log.entries |= map(
  .request.headers |= map(if (.name | ascii_downcase | test("^(authorization|proxy-authorization|cookie|x-api-key)$")) then scrub else . end)
  | .response.headers |= map(if (.name | ascii_downcase) == "set-cookie" then scrub else . end)
  | .request.cookies |= map(scrub)
  | .response.cookies |= map(scrub)
  | .request.queryString |= map(scrub)
  | .request.url |= sub("\\?.*$"; "?REDACTED")
  | if .request.postData then .request.postData.text = "REDACTED" else . end
  | if .response.content.text then .response.content.text = "REDACTED" else . end)
