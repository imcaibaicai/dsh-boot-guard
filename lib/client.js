window.__ModuleLoader__.load({
	id: "dsh-boot-guard",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		// 样式红线契约：在 factory 顶层同步注入并标记 dataset.plugin
		try {
			if (typeof document !== "undefined" && !document.querySelector('style[data-plugin="dsh-boot-guard"]')) {
				const style = document.createElement("style");
				style.dataset.plugin = "dsh-boot-guard";
				style.textContent = `
					.dsh-boot-guard-container {
						padding: 16px;
						color: var(--dsw-alias-label-primary, #333);
						font-family: inherit;
					}
					.dsh-boot-guard-card {
						background: var(--dsw-alias-surface-secondary, #f8f9fa);
						border: 1px solid var(--dsw-alias-border-primary, #e5e7eb);
						border-radius: 8px;
						padding: 16px;
						margin-bottom: 16px;
					}
					.dsh-boot-guard-title {
						font-size: 15px;
						font-weight: 600;
						margin: 0 0 8px 0;
						display: flex;
						align-items: center;
						gap: 8px;
					}
					.dsh-boot-guard-badge-ok {
						background: #10b981;
						color: white;
						font-size: 11px;
						padding: 2px 8px;
						border-radius: 999px;
					}
					.dsh-boot-guard-badge-warn {
						background: #f59e0b;
						color: white;
						font-size: 11px;
						padding: 2px 8px;
						border-radius: 999px;
					}
					.dsh-boot-guard-item {
						font-size: 13px;
						margin: 4px 0;
					}
					.dsh-boot-guard-code {
						font-family: monospace;
						background: var(--dsw-alias-surface-tertiary, #e5e7eb);
						padding: 2px 6px;
						border-radius: 4px;
					}
				`;
				document.head.appendChild(style);
			}
		} catch (e) {
			console.error("[dsh-boot-guard] Style injection error:", e);
		}

		const inject = ["slots"];

		function apply(ctx) {
			try {
				if (!ctx.slots || typeof ctx.slots.inject !== "function") return;

				function BootGuardTab() {
					const React = require("react");
					const report = (typeof window !== "undefined" && window.__DSH_BOOT_GUARD_REPORT__) || {
						verified: [],
						repaired: [],
						errors: []
					};

					const hasRepaired = report.repaired && report.repaired.length > 0;

					return React.createElement(
						"div",
						{ className: "dsh-boot-guard-container" },
						React.createElement(
							"div",
							{ className: "dsh-boot-guard-card" },
							React.createElement(
								"div",
								{ className: "dsh-boot-guard-title" },
								"启动守卫状态: ",
								hasRepaired
									? React.createElement("span", { className: "dsh-boot-guard-badge-warn" }, "已触发自动兜底")
									: React.createElement("span", { className: "dsh-boot-guard-badge-ok" }, "运行正常")
							),
							React.createElement("div", { className: "dsh-boot-guard-item" }, `已核验合法插件: ${report.verified.length} 个`),
							React.createElement("div", { className: "dsh-boot-guard-item" }, `自动兜底畸形插件: ${report.repaired.length} 个`)
						),
						hasRepaired && React.createElement(
							"div",
							{ className: "dsh-boot-guard-card", style: { borderColor: "#f59e0b", background: "#fffbeb" } },
							React.createElement("div", { className: "dsh-boot-guard-title", style: { color: "#b45309" } }, "⚠️ 捕获并隔离的插件清单："),
							report.repaired.map((item, idx) =>
								React.createElement(
									"div",
									{ key: idx, className: "dsh-boot-guard-item" },
									"• 插件 ",
									React.createElement("span", { className: "dsh-boot-guard-code" }, item.id),
									" 缺少 apply 方法，已被就地注入空函数隔离。请检查该插件客户端代码并修复。"
								)
							)
						),
						React.createElement(
							"div",
							{ className: "dsh-boot-guard-card" },
							React.createElement("div", { className: "dsh-boot-guard-title" }, "脱机急救箱 (dsh-rescue)"),
							React.createElement("div", { className: "dsh-boot-guard-item" }, "如遇 DSH 无法正常启动，可在终端随时运行："),
							React.createElement(
								"div",
								{ className: "dsh-boot-guard-item" },
								React.createElement("span", { className: "dsh-boot-guard-code" }, "npx dsh-rescue report")
							),
							React.createElement("div", { className: "dsh-boot-guard-item" }, "可直接解析最新崩溃日志、定位元凶插件，并支持一键从健康基线还原 profile。")
						)
					);
				}

				ctx.slots.inject("settings.plugins.tab", () =>
					ctx.slots.register(
						{
							name: "settings.plugins.tab",
							id: "boot-guard",
							order: 99,
							label: () => "启动守卫"
						},
						BootGuardTab
					)
				);
			} catch (err) {
				console.error("[dsh-boot-guard] Client apply error:", err);
			}
		}

		exports.inject = inject;
		exports.apply = apply;
		return module.exports;
	}
});
