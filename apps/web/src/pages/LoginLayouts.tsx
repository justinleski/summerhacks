import type { CSSProperties } from "react";
import loginDarkArt from "../../../../login dark.png";
import loginLightArt from "../../../../login light.png";

type LoginVariant = "light" | "dark";

type Marker = {
  x: string;
  y: string;
  size?: string;
  tone?: "soft" | "mid" | "strong";
};

type MarkerStyle = CSSProperties & {
  "--login-marker-x": string;
  "--login-marker-y": string;
  "--login-marker-size": string;
};

const variantCopy: Record<
  LoginVariant,
  {
    art: string;
    eyebrow: string;
    title: string;
    subtitle: string;
    cta: string;
  }
> = {
  light: {
    art: loginLightArt,
    eyebrow: "Summerhacks",
    title: "Welcome back",
    subtitle: "Sign in to keep your sessions, friends, and memories together.",
    cta: "Sign in",
  },
  dark: {
    art: loginDarkArt,
    eyebrow: "Summerhacks",
    title: "Welcome back",
    subtitle: "Pick up where the night left off.",
    cta: "Continue",
  },
};

const markers: Record<LoginVariant, Marker[]> = {
  light: [
    { x: "9%", y: "6%", size: "15px" },
    { x: "23%", y: "13%", size: "16px", tone: "strong" },
    { x: "14%", y: "28%", size: "14px" },
    { x: "41%", y: "32%", size: "15px", tone: "strong" },
    { x: "69%", y: "14%", size: "14px", tone: "strong" },
    { x: "88%", y: "7%", size: "15px" },
    { x: "81%", y: "47%", size: "13px", tone: "mid" },
    { x: "26%", y: "73%", size: "15px", tone: "soft" },
    { x: "66%", y: "70%", size: "14px", tone: "mid" },
    { x: "91%", y: "82%", size: "15px", tone: "strong" },
    { x: "17%", y: "91%", size: "15px", tone: "mid" },
  ],
  dark: [
    { x: "7%", y: "8%" },
    { x: "22%", y: "14%" },
    { x: "38%", y: "8%", tone: "strong" },
    { x: "80%", y: "13%", tone: "strong" },
    { x: "86%", y: "31%", tone: "mid" },
    { x: "18%", y: "42%", tone: "mid" },
    { x: "51%", y: "38%" },
    { x: "72%", y: "47%", tone: "soft" },
    { x: "90%", y: "58%", tone: "strong" },
    { x: "12%", y: "72%" },
    { x: "33%", y: "79%", tone: "mid" },
    { x: "71%", y: "86%", tone: "strong" },
  ],
};

function markerStyle(marker: Marker): MarkerStyle {
  return {
    "--login-marker-x": marker.x,
    "--login-marker-y": marker.y,
    "--login-marker-size": marker.size ?? "18px",
  };
}

export function LoginLightPage() {
  return <LoginLayout variant="light" />;
}

export function LoginDarkPage() {
  return <LoginLayout variant="dark" />;
}

function LoginLayout({ variant }: { variant: LoginVariant }) {
  const copy = variantCopy[variant];

  return (
    <main className={`login-layout login-layout--${variant}`}>
      <section className="login-layout__media" aria-label="Lighthouse preview">
        <img className="login-layout__image" src={copy.art} alt="" />
      </section>

      <section className="login-layout__panel" aria-label={`${copy.eyebrow} login`}>
        <div className="login-layout__pattern" aria-hidden="true">
          {markers[variant].map((marker, index) => (
            <span
              className={`login-layout__marker login-layout__marker--${
                marker.tone ?? "base"
              }`}
              key={`${marker.x}-${marker.y}-${index}`}
              style={markerStyle(marker)}
            />
          ))}
        </div>

        <div className="login-form">
          <p className="login-form__brand">{copy.eyebrow}</p>
          <h1 className="login-form__title">{copy.title}</h1>
          <p className="login-form__subtitle">{copy.subtitle}</p>

          <form className="login-form__fields">
            <label className="login-field">
              <span>Email</span>
              <input type="email" placeholder="you@example.com" autoComplete="email" />
            </label>

            <label className="login-field">
              <span>Password</span>
              <input
                type="password"
                placeholder="Enter your password"
                autoComplete="current-password"
              />
            </label>

            <div className="login-form__row">
              <label className="login-check">
                <input type="checkbox" />
                <span>Remember me</span>
              </label>
              <a href="#">Forgot password?</a>
            </div>

            <button className="login-submit" type="button">
              {copy.cta}
            </button>
          </form>

          <p className="login-form__switch">
            New here? <a href="#">Create account</a>
          </p>
        </div>
      </section>
    </main>
  );
}
