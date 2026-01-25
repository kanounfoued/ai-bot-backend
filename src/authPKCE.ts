import { Router } from "express";
import * as client from "openid-client";
import session from "express-session";
import express from "express";

// Keycloak Configuration
const keycloakConfig = {
  url: process.env.KEYCLOAK_URL || "http://localhost:8080",
  realm: process.env.KEYCLOAK_REALM || "test-realm",
  clientId: process.env.KEYCLOAK_CLIENT_ID || "test-figma-mcp-server",
  clientSecret:
    process.env.KEYCLOAK_CLIENT_SECRET || "cNlhsRTGmDvfWRqmaBbUrIFCM0ZbddKt",
  redirectUri: "http://localhost:3000/auth/callback",
};

let config: client.Configuration;

export const initializeAuth = async (app: express.Express) => {
  // Session setup
  app.use(
    session({
      secret: process.env.SESSION_SECRET || "some-secret-key-change-me",
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: false, // Set to true if using HTTPS
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000, // 1 day
      },
    })
  );

  try {
    const issuerUrl = `${keycloakConfig.url}/realms/${keycloakConfig.realm}`;
    console.log(`Discovering OpenID Provider at ${issuerUrl}...`);

    // Discovery
    config = await client.discovery(
      new URL(issuerUrl),
      keycloakConfig.clientId,
      keycloakConfig.clientSecret,
      undefined,
      {
        // This property to ignore SSL check.
        execute: [client.allowInsecureRequests],
      }
    );

    console.log("OpenID Provider discovered successfully.");
  } catch (error) {
    console.error("Failed to initialize OpenID Client:", error);
  }
};

export const authRouter = Router();

// 1. Login Route
authRouter.get("/login", async (req, res) => {
  if (!config) {
    return res.status(503).send("Auth service not ready");
  }

  let code_verifier: string = client.randomPKCECodeVerifier();
  let code_challenge: string = await client.calculatePKCECodeChallenge(
    code_verifier
  );

  let parameters: Record<string, string> = {
    redirect_uri: keycloakConfig.redirectUri,
    scope: "openid profile email",
    code_challenge,
    code_challenge_method: "S256",
    state: "",
  };

  //   if (!config.serverMetadata().supportsPKCE()) {
  /**
   * We cannot be sure the server supports PKCE so we're going to use state too.
   * Use of PKCE is backwards compatible even if the AS doesn't support it which
   * is why we're using it regardless. Like PKCE, random state must be generated
   * for every redirect to the authorization_endpoint.
   */
  parameters.state = client.randomState();
  //   }

  (req.session as any)[parameters.state] = code_verifier;

  const redirectTo: URL = client.buildAuthorizationUrl(config, parameters);
  res.redirect(redirectTo.href);
});

// 2. Callback Route
authRouter.get("/callback", async (req, res) => {
  if (!config) {
    return res.status(503).send("Auth service not ready");
  }

  try {
    const currentUrl = new URL(
      req.protocol + "://" + req.get("host") + req.originalUrl
    );

    const state = currentUrl.searchParams.get("state") ?? "";

    let tokens: client.TokenEndpointResponse =
      await client.authorizationCodeGrant(config, currentUrl, {
        pkceCodeVerifier: (req.session as any)[state],
        expectedState: state,
      });

    const claims = tokens; // ID Token claims

    // Store user info in session
    (req.session as any).user = claims;
    (req.session as any).tokens = tokens;

    // Redirect to frontend
    res.redirect("http://localhost:5173/");
  } catch (err) {
    console.error("Callback error:", err);
    res.status(500).send("Authentication failed");
  }
});

// 3. User Info Route
authRouter.get("/user", (req, res) => {
  if ((req.session as any).user) {
    res.json({
      isAuthenticated: true,
      user: (req.session as any).user,
    });
  } else {
    res.json({ isAuthenticated: false });
  }
});

// 4. Logout Route
authRouter.get("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) console.error("Session destroy error:", err);

    if (config) {
      const endSessionEndpoint = config.serverMetadata().end_session_endpoint;
      if (endSessionEndpoint) {
        const logoutUrl = new URL(endSessionEndpoint);
        // logoutUrl.searchParams.append('post_logout_redirect_uri', 'http://localhost:5173');
        res.redirect(logoutUrl.toString());
      } else {
        res.redirect("http://localhost:5173");
      }
    } else {
      res.redirect("http://localhost:5173");
    }
  });
});
