import { t as __exportAll } from "./rolldown-runtime_D7D4PA-g.mjs";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
var en_default = {
	common: { "backToTop": "BACK TO TOP ↑" },
	nav: {
		"projects": "Projects",
		"blog": "Blog",
		"howIWork": "How I work",
		"contact": "Contact"
	},
	hero: {
		"iam": "I am",
		"role": "AI Security Engineer",
		"scroll": "Scroll",
		"heroName": "Ezequiel"
	},
	brand: {
		"initials": "ER",
		"fullName": "Ezequiel Ranieri"
	},
	a11y: {
		"home": "Home",
		"skipToContent": "Skip to content",
		"mainNavigation": "Main navigation",
		"socialLinks": "Social links",
		"githubProfile": "GitHub profile",
		"linkedinProfile": "LinkedIn profile",
		"xProfile": "X profile",
		"backToTop": "Back to top",
		"closeMenu": "Close menu",
		"menuOpen": "Open menu"
	},
	home: {
		"meta": {
			"title": "Ezequiel Ranieri — AI Security Engineer",
			"description": "AI Security Engineer. Backend & security infrastructure for AI agents: Secure AI Agents, Non-Human Identity, IAM, distributed systems, capability-based security."
		},
		"projects": {
			"aegis": {
				"name": "AEGIS",
				"label": "Secure WASM runtime"
			},
			"agentGateway": {
				"name": "AGENT GATEWAY",
				"label": "AI agent gateway"
			},
			"mettle": {
				"name": "METTLE",
				"label": "Agent evaluation & safety"
			}
		},
		"portfolio": {
			"title": "My Portfolio",
			"subtitle": "Secure AI Agents · Non-Human Identity",
			"cta": "View all on GitHub"
		},
		"blog": {
			"subtitle": "Engineering notes on secure AI agents",
			"cta": "VIEW ALL ARTICLES",
			"emptyHome": "First articles coming soon"
		},
		"howIWork": {
			"subtitle": "Trust infrastructure for autonomous AI systems",
			"categories": {
				"principles": {
					"name": "PRINCIPLES",
					"items": {
						"securityFirst": {
							"name": "Security First",
							"text": "Threat modeling from day 0. Capability-based security, zero-trust, least privilege by default."
						},
						"hexagonalArchitecture": {
							"name": "Hexagonal Architecture",
							"text": "Pure domain with zero external dependencies. Ports & adapters for DB, HTTP, gRPC, OIDC."
						},
						"testingAsSpecification": {
							"name": "Isolation by Default",
							"text": "Tenant isolation enforced in the database with RLS FORCE. Untrusted code runs sandboxed in WASM with metered fuel."
						},
						"nativeObservability": {
							"name": "Verifiable by Construction",
							"text": "Signed receipts and hash-chained audit. Every agent action leaves verifiable proof."
						},
						"simplicityOverCleverness": {
							"name": "Evaluate Before You Trust",
							"text": "Declarative specs, authorization oracles and regression gates in CI. Agent behavior is tested, not assumed."
						},
						"livingDocumentation": {
							"name": "Living Documentation",
							"text": "ADRs for architectural decisions. README as entry point. Comments only for \"why\", never \"what\"."
						}
					}
				},
				"methodology": {
					"name": "METHODOLOGY",
					"items": {
						"exploreFirst": "I explore first: I understand the existing code, constraints and trade-offs before proposing anything",
						"specifyExplicitly": "I specify explicitly: ADRs for irreversible decisions, specs for features",
						"implementInVerticalSlices": "I build in vertical slices: every commit delivers verifiable value",
						"verifyAutomatically": "I verify automatically: tests, linter, type-check and security scan in CI",
						"reviewWithJudgment": "I review with judgment: deep review for medium/high risk, structural review for low-risk changes",
						"deliverInWorkUnitCommits": "I ship per unit of work: tests, docs and code together, Conventional Commits"
					}
				},
				"stack": { "name": "STACK" },
				"certifications": { "name": "CERTIFICATIONS" }
			}
		},
		"contact": {
			"subtitle": "Open to projects and collaborations",
			"description": "Building agents that act on real systems? I can help design the identity, isolation and audit layer. Tell me what you're working on.",
			"info": {
				"addressLabel": "Location",
				"emailLabel": "EMAIL"
			},
			"form": {
				"nameLabel": "NAME",
				"namePlaceholder": "Your name",
				"phoneLabel": "PHONE",
				"phonePlaceholder": "Optional",
				"emailLabel": "Email",
				"emailPlaceholder": "you@example.com",
				"messageLabel": "MESSAGE",
				"messagePlaceholder": "Tell me about your project",
				"privacyNotice": "Used only to reply to you. Spam protection processes technical data such as your IP address.",
				"submit": "SEND MESSAGE",
				"sending": "SENDING...",
				"validation": {
					"nameRequired": "Please enter your name.",
					"emailInvalid": "Please enter a valid e-mail address.",
					"messageMinLength": "Please write at least 10 characters.",
					"captchaRequired": "Please complete the captcha."
				},
				"status": {
					"success": "MESSAGE SENT. I'LL GET BACK TO YOU SOON.",
					"error": "SOMETHING WENT WRONG. TRY AGAIN OR EMAIL ME DIRECTLY."
				}
			},
			"footer": {}
		},
		"menu": { "toggle": "MENU" },
		"stack": {
			"languages": {
				"label": "LANGUAGES",
				"text": "Go (primary) · Rust · Python"
			},
			"runtimeInfra": {
				"label": "RUNTIME / INFRA",
				"text": "Kubernetes · NATS · PostgreSQL · Redis · SQLite"
			},
			"security": {
				"label": "SECURITY",
				"text": "SPIFFE/SPIRE · OPA/Cedar · sigstore/cosign · WASM (wasmtime)"
			},
			"observability": {
				"label": "OBSERVABILITY",
				"text": "OpenTelemetry · Prometheus · Grafana · Loki · Tempo"
			},
			"testing": {
				"label": "TESTING",
				"text": "testify · ginkgo · quickcheck · testcontainers"
			},
			"tooling": {
				"label": "TOOLING",
				"text": "sqlc · buf/protobuf · golangci-lint · gofumpt · direnv"
			}
		},
		"certifications": {
			"developingSecureSoftware": {
				"name": "Developing Secure Software (LFD121)",
				"issuer": "Linux Foundation · 2026"
			},
			"secureAiMlDrivenSoftwareDevelopment": {
				"name": "Secure AI/ML-Driven Software Development",
				"issuer": "Linux Foundation · 2026"
			}
		}
	},
	blog: {
		"meta": { "title": "Blog · Ezequiel Ranieri" },
		"empty": "No articles published yet.",
		"backToHome": "BACK TO HOME"
	},
	article: {
		"labelPrefix": "BLOG / ",
		"backToBlog": "BACK TO BLOG",
		"minRead": "{{m}} MIN READ",
		"updated": "UPDATED {{date}}",
		"previousArticle": "PREVIOUS ARTICLE",
		"nextArticle": "NEXT ARTICLE",
		"allArticles": "ALL ARTICLES",
		"tableOfContents": "CONTENTS",
		"articleGithub": "VIEW ON GITHUB ↗"
	},
	notFound: {
		"meta": {
			"title": "404 · Ezequiel Ranieri",
			"description": "Page not found"
		},
		"title": "404",
		"message": "The page you're looking for doesn't exist."
	},
	contactApi: {
		"rateLimited": "Too many requests. Please try again later.",
		"forbidden": "Request rejected: unexpected origin.",
		"captchaFailed": "Captcha verification failed. Please try again.",
		"invalidJson": "Invalid JSON payload.",
		"messageTooLong": "Message too long (max 2000 characters)."
	},
	switcher: {
		"labelEn": "EN",
		"labelEs": "ES",
		"switchToEn": "Switch to English",
		"switchToEs": "Cambiar a español",
		"ariaLabel": "Language switcher",
		"noticeNoTranslation": "ARTICLE AVAILABLE IN ENGLISH ONLY"
	}
};
//#endregion
//#region src/i18n/index.ts
var translations = {
	en: en_default,
	es: {
		common: { "backToTop": "VOLVER ARRIBA ↑" },
		nav: {
			"projects": "Proyectos",
			"blog": "Blog",
			"howIWork": "Cómo trabajo",
			"contact": "Contacto"
		},
		hero: {
			"iam": "Soy",
			"role": "Ingeniero en Seguridad de IA",
			"scroll": "Scroll",
			"heroName": "Ezequiel"
		},
		brand: {
			"initials": "ER",
			"fullName": "Ezequiel Ranieri"
		},
		a11y: {
			"home": "Inicio",
			"skipToContent": "Saltar al contenido",
			"mainNavigation": "Navegación principal",
			"socialLinks": "Redes sociales",
			"githubProfile": "Perfil de GitHub",
			"linkedinProfile": "Perfil de LinkedIn",
			"xProfile": "Perfil de X",
			"backToTop": "Volver arriba",
			"closeMenu": "Cerrar menú",
			"menuOpen": "Abrir menú"
		},
		home: {
			"meta": {
				"title": "Ezequiel Ranieri — Ingeniero en Seguridad de IA",
				"description": "Ingeniero en seguridad de IA. Infraestructura backend y de seguridad para agentes de IA: identidad no humana, IAM, sistemas distribuidos y seguridad basada en capacidades."
			},
			"projects": {
				"aegis": {
					"name": "AEGIS",
					"label": "Secure WASM runtime"
				},
				"agentGateway": {
					"name": "AGENT GATEWAY",
					"label": "Gateway de agentes"
				},
				"mettle": {
					"name": "METTLE",
					"label": "Evaluación y safety de agentes"
				}
			},
			"portfolio": {
				"title": "Mi portfolio",
				"subtitle": "Agentes de IA seguros · Non-Human Identity",
				"cta": "Ver todo en GitHub"
			},
			"blog": {
				"subtitle": "Notas de ingeniería sobre agentes de IA seguros",
				"cta": "VER ARTÍCULOS",
				"emptyHome": "Primeros artículos muy pronto"
			},
			"howIWork": {
				"subtitle": "Infraestructura de confianza para sistemas de IA autónomos",
				"categories": {
					"principles": {
						"name": "PRINCIPIOS",
						"items": {
							"securityFirst": {
								"name": "Seguridad primero",
								"text": "Modelado de amenazas desde el día 0. Seguridad basada en capacidades, zero-trust, mínimo privilegio por defecto."
							},
							"hexagonalArchitecture": {
								"name": "Arquitectura hexagonal",
								"text": "Dominio puro con cero dependencias externas. Puertos y adaptadores para BD, HTTP, gRPC, OIDC."
							},
							"testingAsSpecification": {
								"name": "Aislamiento por defecto",
								"text": "Aislamiento de tenants en la base de datos con RLS FORCE. Código no confiable en sandbox WASM con fuel medido."
							},
							"nativeObservability": {
								"name": "Verificable por diseño",
								"text": "Recibos firmados y auditoría con hash encadenado. Cada acción del agente deja evidencia verificable."
							},
							"simplicityOverCleverness": {
								"name": "Evaluar antes de confiar",
								"text": "Specs declarativos, oráculos de autorización y gates de regresión en CI. Comportamiento del agente probado, no supuesto."
							},
							"livingDocumentation": {
								"name": "Documentación viva",
								"text": "ADRs para decisiones arquitectónicas. README como punto de entrada. Comentarios solo para el \"porqué\", nunca el \"qué\"."
							}
						}
					},
					"methodology": {
						"name": "METODOLOGÍA",
						"items": {
							"exploreFirst": "Exploro primero: entiendo el código existente, las restricciones y los trade-offs antes de proponer",
							"specifyExplicitly": "Especifico explícitamente: ADR para decisiones irreversibles, spec para features",
							"implementInVerticalSlices": "Implemento en slices verticales: cada commit entrega valor verificable",
							"verifyAutomatically": "Verifico automáticamente: tests, linter, type-check y security scan en CI",
							"reviewWithJudgment": "Reviso con criterio: revisión a fondo en riesgo medio/alto, revisión estructural en cambios de bajo riesgo",
							"deliverInWorkUnitCommits": "Entrego por unidad de trabajo: tests, docs y código juntos, Conventional Commits"
						}
					},
					"stack": { "name": "STACK" },
					"certifications": { "name": "CERTIFICACIONES" }
				}
			},
			"contact": {
				"subtitle": "Abierto a proyectos y colaboraciones",
				"description": "¿Construís agentes que operan sobre sistemas reales? Puedo ayudarte a diseñar la capa de identidad, aislamiento y auditoría. Contame en qué trabajás.",
				"info": {
					"addressLabel": "Ubicación",
					"emailLabel": "EMAIL"
				},
				"form": {
					"nameLabel": "NOMBRE",
					"namePlaceholder": "Tu nombre",
					"phoneLabel": "TELÉFONO",
					"phonePlaceholder": "Opcional",
					"emailLabel": "Email",
					"emailPlaceholder": "tu@ejemplo.com",
					"messageLabel": "MENSAJE",
					"messagePlaceholder": "Contame sobre tu proyecto",
					"privacyNotice": "Tus datos se usan solo para responderte. La protección antispam procesa datos técnicos, como tu dirección IP.",
					"submit": "ENVIAR MENSAJE",
					"sending": "ENVIANDO...",
					"validation": {
						"nameRequired": "Por favor ingresá tu nombre.",
						"emailInvalid": "Por favor ingresá un correo electrónico válido.",
						"messageMinLength": "Por favor escribí al menos 10 caracteres.",
						"captchaRequired": "Por favor completá el captcha."
					},
					"status": {
						"success": "MENSAJE ENVIADO. TE RESPONDERÉ PRONTO.",
						"error": "ALGO SALIÓ MAL. INTENTÁ DE NUEVO O ESCRIBIME DIRECTAMENTE."
					}
				},
				"footer": {}
			},
			"menu": { "toggle": "MENÚ" },
			"stack": {
				"languages": {
					"label": "LENGUAJES",
					"text": "Go (principal) · Rust · Python"
				},
				"runtimeInfra": {
					"label": "RUNTIME / INFRA",
					"text": "Kubernetes · NATS · PostgreSQL · Redis · SQLite"
				},
				"security": {
					"label": "SEGURIDAD",
					"text": "SPIFFE/SPIRE · OPA/Cedar · sigstore/cosign · WASM (wasmtime)"
				},
				"observability": {
					"label": "OBSERVABILIDAD",
					"text": "OpenTelemetry · Prometheus · Grafana · Loki · Tempo"
				},
				"testing": {
					"label": "PRUEBAS",
					"text": "testify · ginkgo · quickcheck · testcontainers"
				},
				"tooling": {
					"label": "HERRAMIENTAS",
					"text": "sqlc · buf/protobuf · golangci-lint · gofumpt · direnv"
				}
			},
			"certifications": {
				"developingSecureSoftware": {
					"name": "Developing Secure Software (LFD121)",
					"issuer": "Linux Foundation · 2026"
				},
				"secureAiMlDrivenSoftwareDevelopment": {
					"name": "Secure AI/ML-Driven Software Development",
					"issuer": "Linux Foundation · 2026"
				}
			}
		},
		blog: {
			"meta": { "title": "Blog · Ezequiel Ranieri" },
			"empty": "No hay artículos publicados aún.",
			"backToHome": "VOLVER AL INICIO"
		},
		article: {
			"labelPrefix": "BLOG / ",
			"backToBlog": "VOLVER AL BLOG",
			"minRead": "{{m}} MIN DE LECTURA",
			"updated": "ACTUALIZADO {{date}}",
			"previousArticle": "ARTÍCULO ANTERIOR",
			"nextArticle": "ARTÍCULO SIGUIENTE",
			"allArticles": "VER ARTÍCULOS",
			"tableOfContents": "ÍNDICE",
			"articleGithub": "VER EN GITHUB ↗"
		},
		notFound: {
			"meta": {
				"title": "404 · Ezequiel Ranieri",
				"description": "Página no encontrada"
			},
			"title": "404",
			"message": "La página que buscas no existe."
		},
		contactApi: {
			"rateLimited": "Demasiadas solicitudes. Por favor intentá más tarde.",
			"forbidden": "Solicitud rechazada: origen inesperado.",
			"captchaFailed": "La verificación del captcha falló. Por favor intentá de nuevo.",
			"invalidJson": "Carga JSON inválida.",
			"messageTooLong": "Mensaje demasiado largo (máximo 2000 caracteres)."
		},
		switcher: {
			"labelEn": "EN",
			"labelEs": "ES",
			"switchToEn": "Switch to English",
			"switchToEs": "Cambiar a español",
			"ariaLabel": "Selector de idioma",
			"noticeNoTranslation": "ARTÍCULO DISPONIBLE SOLO EN INGLÉS"
		}
	}
};
function getTranslator(locale) {
	const dict = translations[locale] || translations[en_default];
	return function t(key, params) {
		const parts = key.split(".");
		let cur = dict;
		for (const p of parts) {
			cur = cur?.[p];
			if (cur === void 0) {
				let cen = translations[en_default];
				for (const pp of parts) {
					cen = cen?.[pp];
					if (cen === void 0) return key;
				}
				cur = cen;
				break;
			}
		}
		if (typeof cur !== "string") return key;
		if (!params) return cur;
		let out = cur;
		for (const [k, v] of Object.entries(params)) out = out.replace(new RegExp(`\\{\\{${k}\\}\\}`, "g"), String(v));
		return out;
	};
}
//#endregion
//#region src/lib/request-guards.ts
/**
* Cross-origin guard for the unauthenticated contact endpoint.
*
* There is no session to protect here, so a CSRF token would add ceremony
* without adding protection. What is worth rejecting is a page that is not
* ours submitting the endpoint on a visitor's behalf.
*
* - `Origin` present and not on the allowlist -> cross-origin. A browser can
*   never forge `Origin`, so comparing it against the places this site
*   actually runs at is sufficient.
* - The allowlist is: the origin the request was actually sent to (same-origin
*   by definition and needed for custom domains and preview deployments),
*   `siteUrl` (the canonical production site), the current `VERCEL_URL`
*   preview deployment when set, and localhost dev servers outside
*   production. Matching origins requires scheme, host and port.
* - `Origin` absent -> NOT cross-origin. curl, server-to-server calls and some
*   privacy modes omit it; absence is not evidence of an attack, and treating
*   it as one would break non-browser clients for no security gain.
* - `Sec-Fetch-Site: cross-site` -> cross-origin even when `Origin` was
*   stripped. `same-origin`, `same-site` and `none` pass.
*/
function isCrossOriginRequest(request, siteUrl) {
	const site = request.headers.get("sec-fetch-site");
	if (site && site.trim().toLowerCase() === "cross-site") return true;
	const origin = request.headers.get("origin");
	if (origin === null) return false;
	return !collectAllowedOrigins(request, siteUrl).has(normalizeOrigin(origin));
}
function collectAllowedOrigins(request, siteUrl) {
	const allowed = /* @__PURE__ */ new Set();
	try {
		allowed.add(new URL(request.url).origin.toLowerCase());
	} catch {}
	if (siteUrl) allowed.add(normalizeOrigin(siteUrl));
	const vercelUrl = process.env.VERCEL_URL;
	if (vercelUrl) allowed.add(normalizeOrigin(/^https?:\/\//i.test(vercelUrl) ? vercelUrl : `https://${vercelUrl.trim()}`));
	if (process.env.NODE_ENV !== "production") {
		allowed.add("http://localhost:4321");
		allowed.add("http://127.0.0.1:4321");
		allowed.add("http://localhost:3000");
		allowed.add("http://127.0.0.1:3000");
	}
	return allowed;
}
function normalizeOrigin(value) {
	const trimmed = value.trim().toLowerCase().replace(/\/+$/, "");
	try {
		return new URL(trimmed).origin;
	} catch {
		return trimmed;
	}
}
/** Window length: one hour. */
var RATE_LIMIT_WINDOW_MS = 36e5;
/**
* Sliding-window limiter kept in process memory.
* Exported so the fallback path is unit-testable with an injected clock.
*/
var MemoryRateLimiter = class {
	hits = /* @__PURE__ */ new Map();
	max;
	windowMs;
	now;
	constructor(max = 5, windowMs = RATE_LIMIT_WINDOW_MS, now = Date.now) {
		this.max = max;
		this.windowMs = windowMs;
		this.now = now;
	}
	check(key) {
		const now = this.now();
		const recent = (this.hits.get(key) ?? []).filter((ts) => now - ts < this.windowMs);
		if (recent.length >= this.max) {
			this.hits.set(key, recent);
			return {
				success: false,
				remaining: 0,
				reset: recent[0] + this.windowMs,
				provider: "memory"
			};
		}
		recent.push(now);
		this.hits.set(key, recent);
		this.evictExpired(now);
		return {
			success: true,
			remaining: this.max - recent.length,
			reset: now + this.windowMs,
			provider: "memory"
		};
	}
	/** Keeps a long-lived instance from accumulating keys forever. */
	evictExpired(now) {
		if (this.hits.size <= 1e3) return;
		for (const [key, timestamps] of this.hits) if (timestamps.every((ts) => now - ts >= this.windowMs)) this.hits.delete(key);
	}
};
function readEnv(name) {
	const fromBuild = Object.assign({
		"ASSETS_PREFIX": void 0,
		"BASE_URL": "/",
		"DEV": false,
		"MODE": "production",
		"PROD": true,
		"SITE": "https://ezequielranieri.vercel.app",
		"SSR": true
	}, { _: "/home/ez/new-portfolio/node_modules/.bin/astro" })[name];
	if (fromBuild) return fromBuild;
	if (typeof process !== "undefined") return process.env?.[name] || void 0;
}
var warned = false;
function warnOnce(message) {
	if (warned) return;
	warned = true;
	console.warn(message);
}
function createRateLimiter() {
	const url = readEnv("UPSTASH_REDIS_REST_URL");
	const token = readEnv("UPSTASH_REDIS_REST_TOKEN");
	const memory = new MemoryRateLimiter();
	if (!url || !token) {
		warnOnce("Contact rate limiting: UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN are not set. Falling back to per-instance memory limiting; the limit is not shared across instances.");
		return { limit: async (key) => memory.check(key) };
	}
	const ratelimit = new Ratelimit({
		redis: new Redis({
			url,
			token
		}),
		limiter: Ratelimit.slidingWindow(5, "1 h"),
		prefix: "contact-ratelimit",
		analytics: false
	});
	return { async limit(key) {
		try {
			const { success, remaining, reset } = await ratelimit.limit(key);
			return {
				success,
				remaining,
				reset,
				provider: "upstash"
			};
		} catch (error) {
			warnOnce(`Contact rate limiting: Upstash call failed, falling back to memory: ${String(error)}`);
			return memory.check(key);
		}
	} };
}
//#endregion
//#region src/lib/turnstile.ts
/**
* Cloudflare Turnstile verification.
*
* The widget on the page produces a single-use token; only Siteverify decides
* whether it is real. Verification is skipped entirely when no secret is
* configured, so local development and previews do not require Cloudflare
* credentials. Once a secret IS configured the check fails closed: a missing,
* expired, reused or unverifiable token is rejected rather than let through.
*/
var SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
async function verifyTurnstileToken({ token, secret, remoteIp, fetchImpl = fetch }) {
	if (!secret) return {
		success: true,
		skipped: true
	};
	const value = typeof token === "string" ? token.trim() : "";
	if (!value) return {
		success: false,
		skipped: false,
		reason: "missing-token"
	};
	const body = new URLSearchParams({
		secret,
		response: value
	});
	if (remoteIp && remoteIp !== "unknown") body.set("remoteip", remoteIp);
	try {
		const response = await fetchImpl(SITEVERIFY_URL, {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: body.toString()
		});
		if (!response.ok) return {
			success: false,
			skipped: false,
			reason: "verify-error"
		};
		const result = await response.json();
		if (result.success === true) return {
			success: true,
			skipped: false
		};
		return {
			success: false,
			skipped: false,
			reason: "rejected",
			errorCodes: result["error-codes"] ?? []
		};
	} catch {
		return {
			success: false,
			skipped: false,
			reason: "verify-error"
		};
	}
}
//#endregion
//#region src/pages/api/contact.ts
var contact_exports = /* @__PURE__ */ __exportAll({
	POST: () => POST,
	prerender: () => false
});
var ALLOWED_LOCALES = ["en", "es"];
var DEFAULT_LOCALE = "en";
function validateLocale(locale) {
	if (typeof locale !== "string") return DEFAULT_LOCALE;
	return ALLOWED_LOCALES.includes(locale) ? locale : DEFAULT_LOCALE;
}
var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
var limiter = createRateLimiter();
var warnedMissingTurnstile = false;
function getClientIP(request) {
	const forwarded = request.headers.get("x-forwarded-for");
	if (forwarded) return forwarded.split(",")[0].trim();
	const realIP = request.headers.get("x-real-ip");
	if (realIP) return realIP;
	return "unknown";
}
function getT(locale) {
	return getTranslator(locale);
}
async function sendEmail(data) {
	console.error("Missing Resend configuration (RESEND_API_KEY, CONTACT_FROM_EMAIL, CONTACT_TO_EMAIL)");
	throw new Error("Email service not configured");
}
var POST = async ({ request, url }) => {
	const t = getT(validateLocale(url.searchParams.get("locale")));
	try {
		const ip = getClientIP(request);
		if (isCrossOriginRequest(request, "https://ezequielranieri.vercel.app")) return new Response(JSON.stringify({
			success: false,
			message: t("contactApi.forbidden")
		}), {
			status: 403,
			headers: { "Content-Type": "application/json" }
		});
		const { success: withinLimit } = await limiter.limit(ip);
		if (!withinLimit) return new Response(JSON.stringify({
			success: false,
			message: t("contactApi.rateLimited")
		}), {
			status: 429,
			headers: { "Content-Type": "application/json" }
		});
		let payload;
		try {
			payload = await request.json();
		} catch {
			return new Response(JSON.stringify({
				success: false,
				message: t("contactApi.invalidJson")
			}), {
				status: 400,
				headers: { "Content-Type": "application/json" }
			});
		}
		if (payload._gotcha && payload._gotcha.trim()) return new Response(JSON.stringify({
			success: true,
			message: t("home.contact.form.status.success")
		}), {
			status: 200,
			headers: { "Content-Type": "application/json" }
		});
		if (!payload.name || !payload.name.trim()) return new Response(JSON.stringify({
			success: false,
			message: t("home.contact.form.validation.nameRequired")
		}), {
			status: 400,
			headers: { "Content-Type": "application/json" }
		});
		if (!payload.email || !EMAIL_RE.test(payload.email.trim())) return new Response(JSON.stringify({
			success: false,
			message: t("home.contact.form.validation.emailInvalid")
		}), {
			status: 400,
			headers: { "Content-Type": "application/json" }
		});
		if (!payload.message || payload.message.trim().length < 10) return new Response(JSON.stringify({
			success: false,
			message: t("home.contact.form.validation.messageMinLength")
		}), {
			status: 400,
			headers: { "Content-Type": "application/json" }
		});
		if (payload.message.trim().length > 2e3) return new Response(JSON.stringify({
			success: false,
			message: t("contactApi.messageTooLong")
		}), {
			status: 400,
			headers: { "Content-Type": "application/json" }
		});
		const turnstileSecret = void 0;
		if (!warnedMissingTurnstile) {
			warnedMissingTurnstile = true;
			console.warn("Contact form: TURNSTILE_SECRET_KEY is not set; captcha verification is skipped.");
		}
		const captcha = await verifyTurnstileToken({
			token: payload.turnstileToken,
			secret: turnstileSecret,
			remoteIp: ip
		});
		if (!captcha.success) {
			if (captcha.reason === "verify-error") console.error("Contact form: Turnstile verification failed", captcha.errorCodes ?? []);
			return new Response(JSON.stringify({
				success: false,
				message: t("contactApi.captchaFailed")
			}), {
				status: 400,
				headers: { "Content-Type": "application/json" }
			});
		}
		await sendEmail(payload);
		return new Response(JSON.stringify({
			success: true,
			message: t("home.contact.form.status.success")
		}), {
			status: 200,
			headers: { "Content-Type": "application/json" }
		});
	} catch (error) {
		console.error("Contact form error:", error);
		return new Response(JSON.stringify({
			success: false,
			message: t("home.contact.form.status.error")
		}), {
			status: 500,
			headers: { "Content-Type": "application/json" }
		});
	}
};
//#endregion
//#region \0virtual:astro:page:src/pages/api/contact@_@ts
var page = () => contact_exports;
//#endregion
export { page };
