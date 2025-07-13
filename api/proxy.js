const {proxy} = require("pinski/plugins")
const {getUser} = require("../utils/getuser")
const constants = require("../utils/constants.js")

const authorizedPaths = [
    `/api/v1/captions/(${constants.regex.video_id})`,
    `/videoplayback`
]

const proxiedHeaders = [
    "content-type", "date", "last-modified", "expires",
    "cache-control", "accept-ranges", "content-range",
    "origin", "etag", "content-length", "transfer-encoding"
]

module.exports = [
    {
        route: `/proxy`,
        methods: ["GET"],
        code: async ({req, fill, url}) => {
            const instanceOrigin = getUser(req).getSettingsOrDefaults().instance
            const remotePath = url.searchParams.get("url")
            console.log("Requested URL:", remotePath)
            if (!remotePath) {
                console.log("No URL provided")
                return {
                    statusCode: 400,
                    content: "CloudTube: Missing URL parameter",
                    contentType: "text/plain"
                }
            }
            let fetchURL
            try {
                fetchURL = new URL(remotePath, instanceOrigin)
            } catch (e) {
                console.log("Invalid URL:", remotePath, e)
                return {
                    statusCode: 400,
                    content: "CloudTube: Invalid URL",
                    contentType: "text/plain"
                }
            }
            console.log("fetchURL:", fetchURL.toString())
            console.log("pathname:", fetchURL.pathname)
            console.log("instanceOrigin:", instanceOrigin)
            console.log("fetchURL.hostname:", fetchURL.hostname)

            const allowedDomains = [instanceOrigin, /\.googlevideo\.com$/]
            const isDomainAllowed = allowedDomains.some(domain =>
                domain instanceof RegExp ? domain.test(fetchURL.hostname) : fetchURL.toString().startsWith(domain)
            )
            console.log("isDomainAllowed:", isDomainAllowed)

            const isPathAuthorized = authorizedPaths.some(element => {
                const matches = fetchURL.pathname.match(new RegExp(`^${element}$`))
                console.log(`Checking path: ${element}, Matches: ${!!matches}`)
                return matches
            })

            if (!isDomainAllowed || !isPathAuthorized) {
                console.log("Unauthorized - Domain or Path check failed")
                return {
                    statusCode: 401,
                    content: "CloudTube: Unauthorized",
                    contentType: "text/plain"
                }
            }

            let proxyResponse
            try {
                proxyResponse = await proxy(fetchURL, {
                    headers: {
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
                        "Referer": "https://www.youtube.com/"
                    }
                }, (h) => {
                    const headers = Object.keys(h)
                        .filter(key => proxiedHeaders.includes(key))
                        .reduce((res, key) => (res[key] = h[key], res), {})
                    headers["access-control-allow-origin"] = "*" // Add CORS
                    console.log("Backend headers:", headers)
                    return headers
                })
                console.log("Backend status:", proxyResponse.statusCode)
            } catch (error) {
                console.error("Proxy error:", error.message)
                return {
                    statusCode: 502,
                    content: `CloudTube: Failed to proxy request - ${error.message}`,
                    contentType: "text/plain"
                }
            }
            console.log("Proxy response status:", proxyResponse.statusCode)
            return proxyResponse
        }
    }
]
