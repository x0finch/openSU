// Tiny i18n: one flat dictionary per language. Chinese is the default.
import { chatEn, chatZh } from '../chat/messages';
import { useStudio } from './store';

const zh = {
  'brand.tagline': '一句话，一座房子',
  'landing.title': '为自建房而生的设计工具',
  'landing.lead': '描述你想要的房子，得到可以推敲的参数化模型：清爽的轴测图、可读的平面图、随时间流转的日照。',
  'landing.cta': '打开示例项目',
  'landing.secondary': '开源 · 可自部署',
  'landing.f1.title': '一句话成房',
  'landing.f1.body': '房间、门窗、楼梯和屋顶都是语义模型，每次修改都经过校验。',
  'landing.f2.title': '日照推演',
  'landing.f2.body': '拖动时间，看阳光扫过每一个房间。',
  'landing.f3.title': '一键出图',
  'landing.f3.body': '轴测在上，彩色平面在下，直接分享。',
  'landing.footer': 'openSU · AGPL-3.0',

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
  'sun.study': '日照分析',
  'sun.hint': '拖动时间，看阳光扫过房间',
  'sun.time': '时间',
  'sun.play': '播放一天',
  'sun.pause': '暂停',
  'sun.exit': '退出日照',
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
  'chat.rail': '助手',
  'chat.body': '很快你就可以在这里用一句话修改房子：加一间卧室、把客厅朝南、换成双坡屋顶。',
  'chat.placeholder': '描述你想要的改动…',
  'chat.send': '发送',
  ...chatZh,

  'sheet.expand': '展开控制面板',
  'sheet.collapse': '收起控制面板',
  'lang.switch': 'English',
  'loading': '正在载入模型',
  'loading3d': '正在生成三维视图',
  'error.webgl': '这台设备无法显示三维视图（需要 WebGL2）。',

  'share.title': '分享的设计',
  'share.body': '分享页面正在建设中。',
  'share.open': '在工作室中打开示例',
  'share.id': '编号',
} as const;

export type MessageKey = keyof typeof zh;

const en: Record<MessageKey, string> = {
  'brand.tagline': 'One sentence, one house',
  'landing.title': 'A design tool for self-built houses',
  'landing.lead': 'Describe the house you want and get a parametric model to refine: crisp axonometrics, readable floor plans and sunlight through the day.',
  'landing.cta': 'Open the sample project',
  'landing.secondary': 'Open source · self-hostable',
  'landing.f1.title': 'A sentence becomes a house',
  'landing.f1.body': 'Rooms, openings, stairs and roofs are a semantic model; every edit is validated.',
  'landing.f2.title': 'Sun study',
  'landing.f2.body': 'Drag the time and watch sunlight sweep the rooms.',
  'landing.f3.title': 'One-click sheets',
  'landing.f3.body': 'Axonometric on top, coloured plan below, ready to share.',
  'landing.footer': 'openSU · AGPL-3.0',

  'project.title.modern-pitched': 'Pitched-roof house',
  'project.sample': 'Sample',
  'facts.plot': 'Plot',
  'facts.area': 'Floor area',
  'facts.storeys': 'Storeys',
  'facts.storeysValue': '{n} storeys',
  'facts.storeysAttic': '{n} + attic',

  'mode.label': 'View',
  'mode.3d': '3D',
  'mode.plan': 'Plan',
  'mode.sheet': 'Sheets',
  'soon': 'Coming soon',

  'views.label': 'Views',
  'views.axo': 'Axo',
  'views.eye': 'Eye',
  'views.elevation': 'Elev.',
  'view.axo-se': 'Axonometric SE',
  'view.axo-ne': 'Axonometric NE',
  'view.axo-nw': 'Axonometric NW',
  'view.axo-sw': 'Axonometric SW',
  'view.eye-sw': 'Eye level SW',
  'view.elev-south': 'South elevation',
  'view.elev-east': 'East elevation',
  'view.elev-north': 'North elevation',
  'view.elev-west': 'West elevation',
  'viewShort.axo-se': 'SE',
  'viewShort.axo-ne': 'NE',
  'viewShort.axo-nw': 'NW',
  'viewShort.axo-sw': 'SW',
  'viewShort.eye-sw': 'Eye',
  'viewShort.elev-south': 'S',
  'viewShort.elev-east': 'E',
  'viewShort.elev-north': 'N',
  'viewShort.elev-west': 'W',

  'levels.label': 'Levels',
  'plan.zoomIn': 'Zoom in',
  'plan.zoomOut': 'Zoom out',
  'plan.fit': 'Fit to window',
  'plan.gesture': 'Pinch to zoom, drag to pan.',
  'view.reset': 'Reset view',
  'north': 'North arrow',
  'view.resetShort': 'Reset',

  'sun.label': 'Sun',
  'sun.study': 'Sun study',
  'sun.hint': 'Drag the time and watch sunlight sweep the rooms',
  'sun.time': 'Time',
  'sun.play': 'Play the day',
  'sun.pause': 'Pause',
  'sun.exit': 'Exit sun study',
  'sun.dates': 'Date',
  'sun.date.winter': 'Dec 21',
  'sun.date.spring': 'Mar 20',
  'sun.date.summer': 'Jun 21',
  'sun.date.autumn': 'Sep 23',
  'sun.date.today': 'Today',
  'sun.position': 'Sun {dir} · {el}° high',
  'sun.span': 'Sunrise {rise} · sunset {set}',

  'cut.label': 'Cutaway',
  'cut.all': 'All',

  'sheets.label': 'Sheets',
  'sheets.generating': 'Rendering {n} / {total}',
  'sheets.ready': '{n} sheets · 1500 × 2000 PNG',
  'sheets.hint': 'Ready to post and share',
  'sheets.downloadAll': 'Download all',
  'sheets.download': 'Download',
  'sheets.share': 'Share',
  'sheets.open': 'Open large',
  'sheets.close': 'Close',
  'sheets.prev': 'Previous',
  'sheets.next': 'Next',
  'sheets.level': '{level} plan',
  'sheets.views': 'Axonometric & elevation',
  'sheets.error': 'The sheets could not be rendered. Reload to try again.',

  'chat.open': 'Open AI assistant',
  'chat.close': 'Close',
  'chat.title': 'AI design assistant',
  'chat.rail': 'AI',
  'chat.body': 'Soon you will edit the house here in one sentence: add a bedroom, turn the living room south, switch to a gable roof.',
  'chat.placeholder': 'Describe a change…',
  'chat.send': 'Send',
  ...chatEn,

  'sheet.expand': 'Expand controls',
  'sheet.collapse': 'Collapse controls',
  'lang.switch': '中文',
  'loading': 'Loading the model',
  'loading3d': 'Building the 3D view',
  'error.webgl': 'This device cannot show the 3D view (WebGL2 required).',

  'share.title': 'Shared design',
  'share.body': 'Share pages are under construction.',
  'share.open': 'Open the sample in the studio',
  'share.id': 'ID',
};

/** Level names in the model are Chinese; English names by position. */
const levelEn = ['Ground floor', 'First floor', 'Second floor', 'Third floor'];

export type Lang = 'zh' | 'en';
export const dictionaries: Record<Lang, Record<MessageKey, string>> = { zh, en };

export function translate(lang: Lang, key: MessageKey, vars?: Record<string, string | number>): string {
  let s = dictionaries[lang][key] ?? zh[key];
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, String(v));
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
