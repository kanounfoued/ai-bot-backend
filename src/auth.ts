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
        // This property specifically fixes OAUTH_HTTP_REQUEST_FORBIDDEN
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

  // Standard Authorization Code Flow parameters (No PKCE)
  const parameters: Record<string, string> = {
    redirect_uri: keycloakConfig.redirectUri,
    scope: "openid profile email",
  };

  const redirectTo = client.buildAuthorizationUrl(config, parameters);
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

    const tokens = await client.authorizationCodeGrant(config, currentUrl, {});

    const claims = tokens.claims(); // ID Token claims
    console.log("User authenticated:", claims);

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
