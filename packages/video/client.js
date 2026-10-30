// video 设置页 —— 参照 DSH 生图设置的交互：
//   顶部「默认 Provider」单选 → 下面每个平台一行，右侧显示 Key 状态、可展开填 Key
window.__ModuleLoader__.load({
  id: 'dsh-video',
  factory(require) {
    const React = require('react');
    const { useState, useEffect, useCallback } = React;
    const h = React.createElement;

    const C = {
      line: 'var(--dsw-alias-border-l, rgba(0,0,0,0.10))',
      text: 'var(--dsw-alias-label-primary, #0f1115)',
      text2: 'var(--dsw-alias-label-secondary, rgba(15,17,21,0.72))',
      text3: 'var(--dsw-alias-label-tertiary, rgba(15,17,21,0.45))',
      card: 'var(--dsw-alias-bg-base, #ffffff)',
      brand: 'var(--dsw-alias-brand-primary, #0f1115)',
      danger: '#e5484d',
      success: '#30a46c',
    };

    const inputBase = {
      width: '100%', height: 34, borderRadius: 8,
      border: '1px solid ' + C.line, background: 'transparent',
      color: C.text, padding: '0 10px', fontSize: 13,
      outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
    };

    // ── 单选圆点（仿截图里的「默认 Provider」）──
    function Radio({ checked, label, onClick, disabled }) {
      return h('button', {
        type: 'button', onClick, disabled,
        style: {
          display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '7px 14px', borderRadius: 999,
          border: '1px solid ' + (checked ? C.brand : C.line),
          background: 'transparent', cursor: disabled ? 'not-allowed' : 'pointer',
          fontSize: 13, color: checked ? C.text : C.text2,
          fontFamily: 'inherit', opacity: disabled ? 0.45 : 1,
        },
      },
        h('span', {
          style: {
            width: 14, height: 14, borderRadius: '50%',
            border: '1.5px solid ' + (checked ? C.brand : 'rgba(120,125,135,0.55)'),
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            flex: '0 0 auto',
          },
        }, checked ? h('span', { style: { width: 7, height: 7, borderRadius: '50%', background: C.brand } }) : null),
        label,
      );
    }

    // ── Key 状态徽章（绿/红）──
    function KeyBadge({ configured }) {
      return h('span', {
        style: {
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '4px 11px', borderRadius: 999,
          border: '1px solid ' + (configured ? C.success : C.danger),
          fontSize: 12, color: configured ? C.success : C.danger,
          whiteSpace: 'nowrap',
        },
      },
        h('span', { style: { width: 6, height: 6, borderRadius: '50%', background: configured ? C.success : C.danger } }),
        configured ? 'Key 已配置' : 'Key 未配置',
      );
    }

    function Field({ label, hint, children }) {
      return h('div', { style: { marginBottom: 14 } },
        h('div', { style: { fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 6 } }, label),
        children,
        hint ? h('div', { style: { marginTop: 5, fontSize: 12, color: C.text3, lineHeight: 1.55 } }, hint) : null,
      );
    }

    function Btn({ children, onClick, disabled, tone }) {
      const isMain = !tone || tone === 'main';
      return h('button', {
        type: 'button', onClick, disabled,
        style: {
          height: 32, padding: '0 14px', borderRadius: 8,
          border: tone === 'danger' ? '1px solid ' + C.danger : (isMain ? 'none' : '1px solid ' + C.line),
          background: isMain ? C.brand : 'transparent',
          color: tone === 'danger' ? C.danger : (isMain ? '#fff' : C.text2),
          fontSize: 13, fontWeight: 500,
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.45 : 1, fontFamily: 'inherit',
        },
      }, children);
    }

    // ── 单个平台：一行，点开展开详情 ──
    function PlatformRow({ id, info, isDefault, expanded, onToggle, onReload, onSetDefault }) {
      const [key, setKey] = useState('');
      const [busy, setBusy] = useState('');
      const [msg, setMsg] = useState(null);
      const supported = true; // 万相 / 火山 / 可灵 / 爱诗 / Vidu 现在都已接入

      // 接口地址 / 模型：可编辑，模型默认用已填的 Key 自动拉取
      const [baseUrl, setBaseUrl] = useState(info.baseUrl || '');
      const [model, setModel] = useState(info.defaultModel || '');
      const [models, setModels] = useState([]);
      const [modelsLoading, setModelsLoading] = useState(false);
      const [modelsError, setModelsError] = useState('');

      const post = async (path, body) => {
        const r = await fetch('/api/video-gen/' + path, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        });
        return r.json();
      };

      // 拉取该平台的视频模型清单（后端按官方文档给出，附带 Key 可达性核对）
      const fetchModels = useCallback(async (silent) => {
        if (!silent) { setBusy('models'); setModelsError(''); }
        else setModelsLoading(true);
        try {
          const j = await post('models', { provider: id });
          // 后端返回的 models 是 [{id,label,accessible}]，兼容纯字符串
          const list = (j.models || []).map((m) =>
            (typeof m === 'string' ? { id: m, label: m, accessible: null } : m)
          );
          setModels(list);
          setModelsError(j.hint || '');
          if (list.length) {
            const ids = list.map((m) => m.id);
            if (!model || !ids.includes(model)) setModel(ids[0]);
          }
        } catch (e) {
          setModelsError(String((e && e.message) || e));
        } finally { setBusy(''); setModelsLoading(false); }
      }, [id, model]);

      // 展开时自动拉一次（不管有没有 Key，都能看到清单）
      useEffect(() => {
        if (expanded) fetchModels(true);
      }, [expanded]);

      const doSave = async () => {
        setBusy('save'); setMsg(null);
        try {
          // 先存 Key（如果填了）
          if (key.trim()) {
            const j = await post('key', { provider: id, key: key.trim() });
            if (!j.ok) { setMsg({ ok: false, text: j.error || 'Key 保存失败' }); return; }
            setKey('');
          }
          // 再存接口地址和模型
          const j2 = await post('settings', { provider: id, baseUrl: baseUrl.trim(), model: model.trim() });
          if (!j2.ok) { setMsg({ ok: false, text: j2.error || '设置保存失败' }); return; }
          setMsg({ ok: true, text: '已保存' });
          onReload();
          // 保存后自动拉模型（如果还没拉过）
          setTimeout(() => fetchModels(true), 300);
        } catch (e) { setMsg({ ok: false, text: String((e && e.message) || e) }); }
        finally { setBusy(''); }
      };

      const doFetchModels = () => fetchModels(false);

      const doTest = async () => {
        setBusy('test'); setMsg(null);
        try {
          const j = await post('test', { provider: id });
          setMsg({ ok: !!j.ok, text: j.message || j.error || '未知结果' });
        } catch (e) { setMsg({ ok: false, text: String((e && e.message) || e) }); }
        finally { setBusy(''); }
      };

      const doClear = async () => {
        setBusy('clear'); setMsg(null);
        try {
          const j = await post('clear', { provider: id });
          if (j.ok) { setMsg({ ok: true, text: '已清除' }); onReload(); }
          else setMsg({ ok: false, text: j.error || '清除失败' });
        } catch (e) { setMsg({ ok: false, text: String((e && e.message) || e) }); }
        finally { setBusy(''); }
      };

      return h('div', { style: { borderBottom: '1px solid ' + C.line } },
        // 折叠行
        h('div', {
          onClick: supported ? onToggle : undefined,
          style: {
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: 12, padding: '16px 4px', cursor: supported ? 'pointer' : 'default',
          },
        },
          h('div', { style: { display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 } },
            h('span', { style: { fontSize: 14, fontWeight: 600, color: C.text } }, info.label),
            isDefault ? h('span', {
              style: { fontSize: 11, padding: '1px 7px', borderRadius: 999, background: C.brand, color: '#fff', flex: '0 0 auto' },
            }, '默认') : null,
          ),
          h('div', { style: { display: 'flex', alignItems: 'center', gap: 10 } },
            h(KeyBadge, { configured: !!info.keyConfigured }),
            supported ? h('span', {
              style: {
                fontSize: 11, color: C.text3,
                transform: expanded ? 'rotate(180deg)' : 'none',
                transition: 'transform .15s ease', display: 'inline-block',
              },
            }, '▾') : h('span', { style: { fontSize: 11, color: C.text3 } }, '暂不支持'),
          ),
        ),

        // 展开内容
        expanded ? h('div', { style: { padding: '0 4px 20px' } },
          info.note ? h('div', { style: { fontSize: 12, color: C.text3, marginBottom: 12, lineHeight: 1.6 } }, info.note) : null,

          h(Field, {
            label: 'API Key',
            hint: info.sharedKey
              ? `与万相/可灵/爱诗/Vidu 共用同一把百炼 Key（保存在 ${info.keyEnvName}）${info.keyConfigured ? `，当前已配置：${info.keyHint}` : ''}`
              : (info.keyConfigured
                ? `当前已配置：${info.keyHint}（留空即保持不变）`
                : `保存在 ${info.keyEnvName}，与生图插件的 Key 互不影响；页面不会读回明文。`),
          },
            h('input', {
              type: 'password', style: inputBase,
              placeholder: info.keyConfigured ? '留空即可保留已配置的 Key' : '粘贴你的 API Key',
              value: key, onChange: (e) => setKey(e.target.value), autoComplete: 'off',
            }),
          ),

          h(Field, { label: '接口地址', hint: '一般不用改；换代理/中转站时填这里' },
            h('input', {
              type: 'text', style: inputBase,
              placeholder: info.baseUrl,
              value: baseUrl, onChange: (e) => setBaseUrl(e.target.value),
            }),
          ),

          h(Field, {
            label: '模型',
            hint: modelsLoading
              ? '正在加载视频模型清单…'
              : (modelsError || (models.length ? `共 ${models.length} 个视频模型（按官方文档列出）` : '暂无')),
          },
            models.length
              ? h('select', {
                  style: { ...inputBase, padding: '0 8px', cursor: 'pointer' },
                  value: model,
                  onChange: (e) => setModel(e.target.value),
                },
                  models.map((m) => h('option', {
                    key: m.id,
                    value: m.id,
                  }, m.label && m.label !== m.id ? `${m.label}（${m.id}）` : m.id)),
                )
              : h('input', {
                  type: 'text', style: inputBase,
                  placeholder: info.defaultModel || '保存 Key 后自动拉取',
                  value: model, onChange: (e) => setModel(e.target.value),
                }),
          ),

          h('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 } },
            h(Btn, { onClick: doSave, disabled: (!key.trim() && !baseUrl.trim() && !model) || busy === 'save' }, busy === 'save' ? '保存中…' : '保存'),
            h(Btn, { tone: 'ghost', onClick: doFetchModels, disabled: busy === 'models' || !info.keyConfigured }, busy === 'models' ? '拉取中…' : '拉取模型'),
            h(Btn, { tone: 'ghost', onClick: doTest, disabled: busy === 'test' || !info.keyConfigured }, busy === 'test' ? '测试中…' : '测试连接'),
            info.keyConfigured ? h(Btn, { tone: 'danger', onClick: doClear, disabled: busy === 'clear' }, '清除 Key') : null,
            !isDefault && info.keyConfigured ? h(Btn, { tone: 'ghost', onClick: () => onSetDefault(id) }, '设为默认') : null,
          ),

          msg ? h('div', { style: { marginTop: 10, fontSize: 12, color: msg.ok ? C.success : C.danger } }, msg.text) : null,
        ) : null,
      );
    }

    function Panel() {
      const [data, setData] = useState(null);
      const [err, setErr] = useState('');
      const [open, setOpen] = useState('wan'); // 默认展开第一个

      const load = useCallback(() => {
        fetch('/api/video-gen/config')
          .then((r) => r.json())
          .then((j) => { if (j.ok) setData(j); else setErr(j.error || '读取失败'); })
          .catch((e) => setErr(String((e && e.message) || e)));
      }, []);

      useEffect(() => { load(); }, [load]);

      const setDefault = useCallback(async (provider) => {
        await fetch('/api/video-gen/provider', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ provider }),
        });
        load();
      }, [load]);

      if (err) return h('div', { style: { padding: 24, color: C.danger, fontSize: 13 } }, '加载失败：' + err);
      if (!data) return h('div', { style: { padding: 24, color: C.text3, fontSize: 13 } }, '加载中…');

      const platforms = Object.entries(data.platforms || {});

      return h('div', { style: { padding: '4px 0 40px' } },
        // 说明
        h('div', { style: { fontSize: 13, color: C.text2, lineHeight: 1.65, marginBottom: 22 } },
          '配置各平台的 API Key，并选择默认平台。',
        ),

        // 默认平台单选
        h('div', { style: { fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 12 } }, '默认平台'),
        h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 8 } },
          platforms.map(([id, info]) => h(Radio, {
            key: id,
            checked: data.provider === id,
            label: info.label,
            disabled: !info.keyConfigured,
            onClick: () => setDefault(id),
          })),
        ),
        h('div', { style: { fontSize: 12, color: C.text3, marginBottom: 26, lineHeight: 1.6 } },
          '只有已配置 Key 的平台可选为默认；生成时可临时指定其他平台。',
        ),

        // 平台列表
        h('div', { style: { borderTop: '1px solid ' + C.line } },
          platforms.map(([id, info]) => h(PlatformRow, {
            key: id,
            id,
            info,
            isDefault: data.provider === id,
            expanded: open === id,
            onToggle: () => setOpen(open === id ? '' : id),
            onReload: load,
            onSetDefault: setDefault,
          })),
        ),

        // 底部提示
        h('div', { style: { marginTop: 22, fontSize: 12, color: C.text3, lineHeight: 1.7 } },
          '生成结果保存在：' + data.workDir,
          h('br'),
          '视频按秒计费，默认 5 秒 / 720P，建议先用低档位测试。',
        ),
      );
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        // ⚠️ 关键：挂到 "settings.plugin.item"（设置页里的插件项），不是 "settings.section"。
        //    dsh-image-gen 用的就是这两个 slot：
        //      plugins.bundle.config —— 插件管理页里的配置卡片
        //      settings.plugin.item  —— 「设置」里对应插件的一栏
        //    （profile 的 cordis.patch.yml 里 ui-settings 是 enabled:false，settings.section 那条路不生效）
        ctx.slots.inject('plugins.bundle.config', () => ctx.slots.register(
          { name: 'plugins.bundle.config', key: 'dsh-video' },
          Panel,
        ));
        ctx.slots.inject('settings.plugin.item', () => ctx.slots.register(
          { name: 'settings.plugin.item', key: 'dsh-video' },
          Panel,
        ));
      },
    };
  },
});