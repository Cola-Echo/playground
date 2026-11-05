<!--
 * File: ui/app/pages/LoginPage.vue
 * Description: Login page component for user authentication with internationalization support
 *
 * Author: Ellinav, iBenzene, bbbugg
-->

<template>
    <div class="login-page">
        <section class="login-hero">
            <div class="hero-mark">
                <svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" />
                    <path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" />
                </svg>
            </div>
            <h1>{{ t("brandName") }}</h1>
            <p>{{ t("brandTagline") }}</p>
            <div class="hero-orbs" aria-hidden="true"><span></span><span></span><span></span></div>
        </section>

        <form action="/login" method="post" class="login-form">
            <button type="button" class="lang-switcher" :title="t('switchLanguage')" @click="toggleLanguage">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="m5 8 6 6" />
                    <path d="m4 14 6-6 2-3" />
                    <path d="M2 5h12" />
                    <path d="M7 2h1" />
                    <path d="m22 22-5-10-5 10" />
                    <path d="M14 18h6" />
                </svg>
            </button>
            <div v-if="configLoaded" class="login-content">
                <h2 class="login-title">
                    {{ requirePassword ? t("loginHeadingAuth") : t("loginHeading") }}
                </h2>
                <label v-if="requireUsername" class="field">
                    <input type="text" name="username" :placeholder="t('usernamePlaceholder')" required autofocus />
                </label>
                <label class="field">
                    <input
                        type="password"
                        :name="requirePassword ? 'password' : 'apiKey'"
                        :placeholder="requirePassword ? t('passwordPlaceholder') : t('apiKeyPlaceholder')"
                        required
                        :autofocus="!requireUsername"
                    />
                </label>
                <button type="submit" class="submit-btn">
                    {{ t("loginBtn") }}
                </button>
            </div>
            <p v-if="errorText" class="error">
                {{ errorText }}
            </p>
        </form>
    </div>
</template>

<script setup>
import { computed, onMounted, ref, watchEffect } from "vue";
import { useRoute } from "vue-router";
import I18n from "../utils/i18n";
import { useTheme } from "../utils/useTheme";

const route = useRoute();

// Create reactive version counter
const langVersion = ref(0);
const requireUsername = ref(false);
const requirePassword = ref(false);
const configLoaded = ref(false);

// Listen for language changes
const onLangChange = () => {
    langVersion.value++;
};

// Initialize theme
useTheme();

onMounted(async () => {
    I18n.onChange(onLangChange);
    try {
        const res = await fetch("/api/auth/config");
        if (res.ok) {
            const data = await res.json();
            requireUsername.value = data.requireUsername;
            requirePassword.value = data.requirePassword;
        }
    } catch (err) {
        console.error("Failed to load auth config", err);
    } finally {
        configLoaded.value = true;
    }
});

const t = (key, options) => {
    langVersion.value; // Access to track changes
    return I18n.t(key, options);
};

const errorText = computed(() => {
    const code = String(route.query.error || "");
    if (code === "1") {
        return requirePassword.value ? t("loginErrorInvalidCredentials") : t("loginErrorInvalidKey");
    }
    if (code === "2") {
        return t("loginErrorRateLimit");
    }
    return "";
});

const toggleLanguage = async () => {
    await I18n.toggleLang();
};

watchEffect(() => {
    document.title = t("loginTitle");
});
</script>

<style lang="less" scoped>
@import "../styles/variables.less";

.login-page {
    min-height: 100vh;
    display: grid;
    grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr);
    align-items: stretch;
}

.login-hero {
    position: relative;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding: 64px 8vw;
    color: #fff;
    background: linear-gradient(150deg, #0f9f8f 0%, #13b49d 45%, #5ccfb0 100%);

    h1 {
        margin: 22px 0 8px;
        font-size: 2.6rem;
        font-weight: 800;
        letter-spacing: -0.02em;
    }

    p {
        margin: 0;
        font-size: 1.05rem;
        opacity: 0.85;
    }
}

.hero-mark {
    width: 60px;
    height: 60px;
    border-radius: 18px;
    display: grid;
    place-items: center;
    background: rgba(255, 255, 255, 0.18);
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.35);
    backdrop-filter: blur(6px);
}

.hero-orbs span {
    position: absolute;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.12);

    &:nth-child(1) {
        width: 380px;
        height: 380px;
        right: -120px;
        bottom: -140px;
    }

    &:nth-child(2) {
        width: 180px;
        height: 180px;
        right: 22%;
        top: -60px;
        background: rgba(255, 255, 255, 0.08);
    }

    &:nth-child(3) {
        width: 90px;
        height: 90px;
        left: 12%;
        bottom: 14%;
        background: rgba(255, 214, 140, 0.25);
    }
}

.login-form {
    position: relative;
    align-self: center;
    justify-self: center;
    width: min(420px, calc(100% - 48px));
    padding: 44px 40px 40px;
    border-radius: 26px;
    background: @background-white;
    box-shadow: @shadow-medium;
}

.login-content {
    display: flex;
    flex-direction: column;
    gap: 14px;
}

.login-title {
    margin: 0 0 6px;
    font-size: 1.4rem;
    font-weight: 800;
    color: @text-primary;
}

.field input {
    width: 100%;
    height: 48px;
    padding: 0 16px;
    border: 1.5px solid @border-light;
    border-radius: 14px;
    background: var(--bg-list-item-hover);
    color: @text-primary;
    font: inherit;
    font-size: 0.95rem;
    transition: all @transition-fast;

    &:focus {
        outline: none;
        border-color: @primary-color;
        background: @background-white;
        box-shadow: @shadow-focus;
    }
}

.submit-btn {
    height: 48px;
    margin-top: 6px;
    border: none;
    border-radius: 14px;
    background: @primary-color;
    color: @text-on-primary;
    font: inherit;
    font-size: 1rem;
    font-weight: 700;
    cursor: pointer;
    box-shadow: 0 10px 22px rgba(var(--color-primary-rgb), 0.3);
    transition: all @transition-fast;

    &:hover {
        background: @primary-hover-color;
        transform: translateY(-1px);
    }
}

.error {
    margin: 18px 0 0;
    padding: 10px 14px;
    border-radius: 12px;
    font-size: 0.9rem;
    color: @error-color;
    background: rgba(var(--color-error-rgb), 0.08);
}

.lang-switcher {
    position: absolute;
    top: 16px;
    right: 16px;
    display: grid;
    place-items: center;
    width: 36px;
    height: 36px;
    border: none;
    border-radius: 12px;
    background: var(--bg-list-item-hover);
    color: @text-secondary;
    cursor: pointer;
    transition: all @transition-fast;

    &:hover {
        color: @primary-color;
    }
}

@media (max-width: 768px) {
    .login-page {
        grid-template-columns: 1fr;
        grid-template-rows: auto 1fr;
    }

    .login-hero {
        padding: 40px 28px 72px;

        h1 {
            font-size: 2rem;
            margin-top: 16px;
        }
    }

    .hero-orbs span:nth-child(3) {
        display: none;
    }

    .login-form {
        margin-top: -44px;
        align-self: start;
        padding: 36px 24px 28px;
    }
}
</style>
