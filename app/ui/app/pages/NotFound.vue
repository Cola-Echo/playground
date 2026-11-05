<!--
 * File: ui/app/pages/NotFound.vue
 * Description: 404 Not Found page component for handling invalid routes
 *
 * Author: iBenzene
-->

<template>
    <div class="not-found">
        <span class="code">404</span>
        <h1>Page not found</h1>
        <p>The page you requested does not exist.</p>
        <a href="/">Back to Playground</a>
    </div>
</template>

<style lang="less" scoped>
@import "../styles/variables.less";

.not-found {
    align-items: center;
    display: flex;
    flex-direction: column;
    height: 100vh;
    justify-content: center;
    gap: 6px;
    color: @text-primary;
}

.code {
    font-size: 4.5rem;
    font-weight: 800;
    line-height: 1;
    letter-spacing: -0.04em;
    background: linear-gradient(135deg, var(--color-primary), #5ccfb0);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
}

h1 {
    font-size: 1.5rem;
    margin: 8px 0 0;
}

p {
    color: @text-secondary;
    margin: 0;
}

a {
    margin-top: 18px;
    padding: 10px 20px;
    border-radius: 14px;
    background: @primary-color;
    color: @text-on-primary;
    font-weight: 700;
    text-decoration: none;
    box-shadow: 0 8px 18px rgba(var(--color-primary-rgb), 0.28);

    &:hover {
        background: @primary-hover-color;
    }
}
</style>
