// Tiny i18n: one flat dictionary per language. Chinese is the default.
import { chatZh } from '../chat/messages';
import { useStudio } from './store';

const zh = {
  'brand.tagline': '一句话，一座房子',
  'landing.title': '为自建房而生的设计工具',
  'landing.lead': '描述你想要的房子，得到可以推敲的参数化模型：清爽的轴测图、可读的平面图、随时间流转的日照。',
  'landing.cta': '打开示例项目',
  'landing.openStudio': '打开工作台',
  'landing.secondary': '开源 · 可自部署',
  'landing.f1.title': '一句话成房',
  'landing.f1.body': '房间、门窗、楼梯和屋顶都是语义模型，每次修改都经过校验。',
  'landing.f2.title': '日照推演',
  'landing.f2.body': '拖动时间，看阳光扫过每一个房间。',
  'landing.f3.title': '一键出图',
  'landing.f3.body': '轴测在上，彩色平面在下，直接分享。',
  'landing.footer': 'openSU · AGPL-3.0',
  'landing.records': '与设计助手的对话会保存在服务器上，用于改进助手，保留 30 天。',
  'landing.heroCaption': '示例项目「{name}」',

  'project.title.modern-pitched': '现代坡顶自建房',
  'project.sample': '示例',
  'facts.plot': '宅基地',
  'facts.area': '建筑面积',
  'facts.storeys': '层数',
  'facts.storeysValue': '{n} 层',
  'facts.storeysAttic': '{n} 层 + 阁楼',

  'mode.label': '视图',
  'mode.3d': '3D',
  'mode.plan': '平面',
  'mode.sheet': '图册',
  'soon': '即将推出',

  'views.label': '视角',
  'views.axo': '轴测',
  'views.eye': '人视',
  'views.elevation': '立面',
  'view.axo-se': '东南轴测',
  'view.axo-ne': '东北轴测',
  'view.axo-nw': '西北轴测',
  'view.axo-sw': '西南轴测',
  'view.eye-sw': '西南人视',
  'view.eye-se': '东南人视',
  'view.elev-south': '南立面',
  'view.elev-east': '东立面',
  'view.elev-north': '北立面',
  'view.elev-west': '西立面',
  'viewShort.axo-se': '东南',
  'viewShort.axo-ne': '东北',
  'viewShort.axo-nw': '西北',
  'viewShort.axo-sw': '西南',
  'viewShort.eye-sw': '人视',
  'viewShort.elev-south': '南',
  'viewShort.elev-east': '东',
  'viewShort.elev-north': '北',
  'viewShort.elev-west': '西',

  'levels.label': '楼层',
  'plan.zoomIn': '放大',
  'plan.zoomOut': '缩小',
  'plan.fit': '适应窗口',
  'plan.gesture': '双指缩放，单指拖动平移。',
  'view.reset': '复位视角',
  'north': '指北针',
  'view.resetShort': '复位',

  'sun.label': '日照',
  'sun.offShort': '未开启',
  'house.reset': '恢复为模板',
  'house.resetConfirm': '确认恢复？当前修改和对话会清除',
  'house.autosaved': '修改自动保存在这个浏览器',
  'house.autosavedAccount': '修改自动保存到账户',
  'projects.title': '我的项目',
  'projects.new': '新建项目',
  'projects.full': '项目已经存满了，删掉一个不用的才能新建。',
  'projects.loading': '正在读取项目',
  'projects.more': '更多操作',
  'projects.rename': '重命名',
  'projects.delete': '删除',
  'projects.deleteAsk': '删除这个项目？',
  'projects.cancel': '取消',
  'projects.nameLabel': '项目名称',
  'projects.copyName': '{name} 副本',
  'projects.conflict': '另一台设备改过这个项目，你的修改已存为副本',
  'projects.notSynced': '未同步，稍后自动重试',
  'projects.tooLarge': '这个项目太大，没能保存到账户',
  'projects.notAdded': '项目已经存满了，这个房子只保存在这个浏览器',
  'projects.why': '登录后，项目随账户保存，换台设备也能打开。',
  'projects.all': '所有项目',
  'projects.edited': '{when}编辑',
  'projects.editedNow': '刚刚编辑',
  'projects.open': '打开',
  'projects.copy': '创建副本',
  'projects.templates': '从模板开始',
  'projects.deleted': '已删除「{name}」',
  'projects.undo': '撤销',
  'projects.notFound': '找不到这个项目',
  'projects.notFoundWhy': '它可能已被删除，或属于另一个账户。',
  'projects.backHome': '回到我的项目',
  'projects.shared': '已分享',

  'share.button': '分享',
  'share.titleOf': '分享「{name}」',
  'share.anyone': '任何拿到链接的人都可以查看',
  'share.viewersCannot': '查看的人不能修改这个项目。',
  'share.link': '分享链接',
  'share.copy': '复制链接',
  'share.send': '发送链接',
  'share.copied': '已复制链接',
  'share.failed': '没能更改分享，请再试一次。',
  'share.needAccount': '分享前，需要把这个项目保存到你的账户。',
  'share.notKept': '这个项目还没有保存到账户，暂时不能分享。',
  'share.viewOnly': '仅查看',
  'share.makeCopy': '创建我的副本',
  'share.replaceAsk': '替换本机上你改过的房子？',
  'share.replace': '替换',
  'share.copyFull': '账户里的项目已存满，删掉一个不用的再试。',
  'share.copyFailed': '没能创建副本，请再试一次。',
  'share.gone': '这个链接已不再分享',
  'share.goneWhy': '分享者关闭了分享，或者链接不完整。',
  'share.goneHome': '打开 openSU',
  'share.error': '暂时打不开这个链接',
  'share.errorWhy': '请稍后再试。',
  'sun.study': '日照分析',
  'sun.hint': '打开日照，或拖动时间，看阳光扫过房间',
  'sun.time': '时间',
  'sun.play': '播放一天',
  'sun.pause': '暂停',
  'sun.exit': '关闭日照',
  'sun.dates': '日期',
  'sun.date.winter': '冬至',
  'sun.date.spring': '春分',
  'sun.date.summer': '夏至',
  'sun.date.autumn': '秋分',
  'sun.date.today': '今天',
  'sun.position': '太阳 {dir} · 高度 {el}°',
  'sun.span': '日出 {rise} · 日落 {set}',

  'cut.label': '剖切',
  'cut.all': '全部',
  'cut.paused': '仅在轴测图中显示',

  'walk.enter': '漫游',
  'walk.enterLong': '进入室内漫游',
  'walk.exit': '退出漫游',
  'walk.hint': 'WASD 或方向键移动 · 空格跳 · 点击画面后移动鼠标环视，Esc 释放 · Shift 加速',
  'walk.hintTouch': '摇杆移动 · “跳”键跳起 · 拖动画面环视',
  'walk.map': '当前位置',
  'walk.goto': '去{level}',
  'walk.joystick': '移动',
  'walk.jump': '跳',

  'sheets.label': '图册',
  'sheets.generating': '正在生成 {n} / {total}',
  'sheets.ready': '{n} 张 · 1500 × 2000 PNG',
  'sheets.hint': '一键发小红书、朋友圈',
  'sheets.downloadAll': '全部下载',
  'sheets.download': '下载',
  'sheets.share': '分享',
  'sheets.open': '查看大图',
  'sheets.close': '关闭',
  'sheets.prev': '上一张',
  'sheets.next': '下一张',
  'sheets.level': '{level}平面图',
  'sheets.views': '轴测与立面',
  'sheets.error': '图册生成失败，请刷新重试。',

  'chat.open': '打开 AI 助手',
  'chat.close': '收起',
  'chat.title': 'AI 设计助手',
  'chat.body': '很快你就可以在这里用一句话修改房子：加一间卧室、把客厅朝南、换成双坡屋顶。',
  'chat.placeholder': '描述你想要的改动…',
  'chat.send': '发送',
  ...chatZh,

  'lang.switch': 'English',
  'loading': '正在载入模型',
  'loading3d': '正在生成三维视图',
  'error.webgl': '这台设备无法显示三维视图（需要 WebGL2）。',

  'share.title': '分享的设计',
  'share.body': '分享页面正在建设中。',
  'share.open': '在工作室中打开示例',
  'share.id': '编号',
  'share.missing': '没有找到这个设计',
  'share.missingBody': '这个链接没有对应的设计：可能抄错了，或者分享已经删除。可以在工作室里从一个示例开始。',
  'share.start': '打开工作室',
  'more.open': '项目菜单',
  'more.location': '位置',
  'more.orientation': '朝向',
  'more.templates': '换一个模板',
  'more.lang': '语言',
  'more.about': '关于 openSU',
  'more.export': '导出对话',
  'bar.views': '视角',
  'bar.levels': '楼层',
  'bar.sun': '日照',
  'bar.walk': '漫游',
  'bar.zoom': '缩放',
  'views.hint': '拖动旋转 · 双击复位',
  'prompt.placeholder': '说一句话，改房子',
  'prompt.collapse': '收起对话',
  'prompt.last': '上一次修改',
  'hint.sun': '看看阳光',
  'hint.walk': '漫游',
  'hint.sheets': '出图册',
  'hint.dismiss': '不再提示',
  'sun.noon': '正午 {t}',
  'sun.dateMenu': '日期',
  'tools.label': '工具',
  'tools.close': '关闭',
  'tools.back': '返回',
  'views.title': '视角',
  'levels.whole': '整栋',
  'levels.cutHeight': '剖切高度：楼面以上 {h} m',
  'sun.sub': '{date} · 太阳在{dir}，高 {el}°',
  'sun.subOff': '{date} · 太阳在地平线下',
  'sun.subRise': '{date} · 日出，太阳在{dir}方地平线上',
  'sun.subSet': '{date} · 日落，太阳在{dir}方地平线上',
  'sun.subDay': '{date} · 极昼 · 太阳在{dir}，高 {el}°',
  'sun.subNight': '{date} · 极夜，太阳整天不升起',
  'sun.polarDay': '极昼，太阳整天不落',
  'sun.polarNight': '极夜',
  'sun.polarNightNote': '这一天太阳不会升到地平线以上，没有日照可看。房子以展示光显示；换个日期看看。',
  'sun.rise': '日出 {t}',
  'sun.set': '日落 {t}',
  'sun.site': '位置与朝向',
  'sun.front': '正面朝{dir}',
  'walk.pill': '漫游中 · {level} · 方向键移动，拖动环顾 · Esc 或点“漫游 ×”退出',
  'walk.pillTouch': '漫游中 · 拖动环顾 · 点“漫游 ×”退出',
  'loc.title': '房子在哪里',
  'loc.newHouse': '新房子在哪里？',
  'loc.intro': '日照取决于房子所在的位置和朝向。',
  'loc.search': '搜索城市：中文、拼音或英文',
  'loc.none': '列表里没有这个地方。可以换个附近的城市，或直接填经纬度。',
  'loc.loading': '正在载入城市列表',
  'loc.mine': '使用我的位置',
  'loc.mineNote': '只在你点按时询问一次。坐标取到 0.01°（约 1 公里），只保存在这个浏览器和房子数据里，不发送给任何服务。',
  'loc.locating': '正在获取位置…',
  'loc.denied': '没能获取位置（未授权或设备不支持）。可以搜索城市或手动填写。',
  'loc.manual': '手动填写经纬度',
  'loc.lat': '纬度（北为正）',
  'loc.lon': '经度（东为正）',
  'loc.apply': '使用这个位置',
  'loc.invalid': '纬度在 -90 到 90 之间，经度在 -180 到 180 之间。',
  'loc.skip': '先跳过，用杭州附近',
  'loc.near': '{name}附近',
  'loc.tz': '时区 {tz} · 按最近的城市{name}',
  'loc.current': '当前位置',
  'loc.edit': '位置改为{name}',
  'loc.source': '城市数据：Wikidata（CC0）、GeoNames（CC BY 4.0）',
  'panel.done': '完成',
  'ori.title': '朝向',
  'ori.front': '房子正面（平面图下方）朝{dir}',
  'ori.drag': '拖动指北针，按 5° 对齐；方向键微调',
  'ori.sunny': '这里正午的太阳在{sun}方：正面朝{sun}，冬天阳光最多。',
  'ori.presets': '常用朝向',
  'ori.dial': '指北针方向',
  'ori.edit': '朝向改为{dir}',
  'tpl.note': '换模板后，可以撤销回到当前的房子。',
  'tpl.edit': '换成模板「{name}」',
  'tpl.restart': '从模板重新开始',
  'tpl.confirm': '当前房子会被替换，可以撤销回来。登录后可以同时保存多个项目，互不覆盖。',
  'tpl.replace': '仍然替换',
  'tpl.confirmTitle': '换成「{name}」？',
  'menu.undo': '撤销',
  'menu.undoStep': '撤销 {s}',
  'menu.redo': '重做',
  'menu.redoStep': '重做 {s}',
  'menu.signInSub': '在其他设备上打开这个房子',
  'loading.studio': '正在打开工作室',
  'loading.sheets': '正在准备图册',
} as const;

export type MessageKey = keyof typeof zh;


/** Level names in the model are Chinese; English names by position. */
const levelEn = ['Ground floor', 'First floor', 'Second floor', 'Third floor'];

export type Lang = 'zh' | 'en';
/** Chinese is always here; English arrives with its module (task 033: not part of the first paint). */
export const dictionaries: Record<Lang, Record<MessageKey, string> | null> = { zh, en: null };

let enLoad: Promise<void> | null = null;
/** Loads a language's dictionary (English only; Chinese is built in). */
export function loadLang(lang: Lang): Promise<void> {
  if (lang === 'zh' || dictionaries.en) return Promise.resolve();
  return (enLoad ??= import('./i18n-en').then((m) => {
    dictionaries.en = m.en;
  }));
}

export function translate(lang: Lang, key: MessageKey, vars?: Record<string, string | number>): string {
  let s = dictionaries[lang]?.[key] ?? zh[key];
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}

export function useT() {
  const lang = useStudio((s) => s.lang);
  return (key: MessageKey, vars?: Record<string, string | number>) => translate(lang, key, vars);
}

/** Display name of a level: the model's (Chinese) name, or a positional English one. */
export function levelName(lang: Lang, name: string, index: number, isAttic: boolean): string {
  if (lang === 'zh') return name;
  return isAttic ? 'Attic' : (levelEn[index] ?? name);
}

// The address or the saved preference asks for English: fetch it now, before the first render needs it.
if (typeof window !== 'undefined') {
  try {
    const q = new URLSearchParams(location.search).get('lang');
    if (q === 'en' || (!q && localStorage.getItem('opensu.lang') === 'en')) void loadLang('en');
  } catch {
    /* no storage: the switch loads it */
  }
}
