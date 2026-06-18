/**
 * I18nManager - lightweight editor UI localization.
 *
 * This first pass targets the stable editor shell and common modal chrome. Deep
 * database/event editors can move onto the same keys incrementally by using
 * I18n.t('key') or data-i18n attributes.
 */
const RR_LANGUAGES = [
    { id: 'en', name: 'English', nativeName: 'English', flag: '🇺🇸' },
    { id: 'ja', name: 'Japanese', nativeName: '日本語', flag: '🇯🇵' },
    { id: 'es', name: 'Spanish', nativeName: 'Español', flag: '🇪🇸' },
    { id: 'zh-Hant', name: 'Traditional Chinese', nativeName: '繁體中文', flag: '🇹🇼' },
    { id: 'zh-Hans', name: 'Simplified Chinese', nativeName: '简体中文', flag: '🇨🇳' },
    { id: 'ru', name: 'Russian', nativeName: 'Русский', flag: '🇷🇺' },
    { id: 'pt', name: 'Portuguese', nativeName: 'Português', flag: '🇵🇹' },
    { id: 'de', name: 'German', nativeName: 'Deutsch', flag: '🇩🇪' },
    { id: 'fr', name: 'French', nativeName: 'Français', flag: '🇫🇷' },
    { id: 'el', name: 'Greek', nativeName: 'Ελληνικά', flag: '🇬🇷' }
];

const RR_DB_TYPE_KEYS = {
    actors: 'menu.actors', classes: 'menu.classes', skills: 'menu.skills', items: 'menu.items',
    weapons: 'menu.weapons', armors: 'menu.armors', enemies: 'menu.enemies', troops: 'menu.troops',
    states: 'menu.states', animations: 'menu.animations', tilesets: 'menu.tilesets', commonEvents: 'menu.commonEvents',
    system: 'menu.system', system1: 'db.system1', system2: 'db.system2', types: 'menu.types', terms: 'menu.terms'
};

const RR_EVENT_COMMAND_NAMES = {
    ja: {
        'End': '終了', 'Show Text': '文章の表示', 'Show Choices': '選択肢の表示', 'Input Number': '数値入力の処理', 'Select Item': 'アイテム選択の処理', 'Show Scrolling Text': 'スクロール文章の表示', 'Comment': '注釈', 'Conditional Branch': '条件分岐', 'Loop': 'ループ', 'Break Loop': 'ループの中断', 'Exit Event Processing': 'イベント処理の中断', 'Exit Event': 'イベント処理の中断', 'Common Event': 'コモンイベント', 'Label': 'ラベル', 'Jump to Label': 'ラベルジャンプ', 'Control Switches': 'スイッチの操作', 'Control Variables': '変数の操作', 'Control Self Switch': 'セルフスイッチの操作', 'Control Timer': 'タイマーの操作', 'Change Gold': '所持金の増減', 'Change Items': 'アイテムの増減', 'Change Weapons': '武器の増減', 'Change Armors': '防具の増減', 'Change Party Members': 'メンバーの入れ替え', 'Change Party Member': 'メンバーの入れ替え', 'Change Battle BGM': '戦闘BGMの変更', 'Change Victory ME': '勝利MEの変更', 'Change Save Access': 'セーブ禁止の変更', 'Change Menu Access': 'メニュー禁止の変更', 'Change Encounter': 'エンカウント禁止の変更', 'Change Formation Access': '並び替え禁止の変更', 'Change Window Color': 'ウィンドウカラーの変更', 'Change Defeat ME': '敗北MEの変更', 'Change Vehicle BGM': '乗り物BGMの変更', 'Transfer Player': '場所移動', 'Set Vehicle Location': '乗り物の位置設定', 'Set Event Location': 'イベントの位置設定', 'Scroll Map': 'マップのスクロール', 'Set Movement Route': '移動ルートの設定', 'Get on/off Vehicle': '乗り物の乗降', 'Change Transparency': '透明状態の変更', 'Show Animation': 'アニメーションの表示', 'Show Balloon Icon': 'フキダシアイコンの表示', 'Erase Event': 'イベントの一時消去', 'Change Player Followers': '隊列歩行の変更', 'Gather Followers': '隊列メンバーの集合', 'Fadeout Screen': '画面のフェードアウト', 'Fadein Screen': '画面のフェードイン', 'Tint Screen': '画面の色調変更', 'Flash Screen': '画面のフラッシュ', 'Shake Screen': '画面のシェイク', 'Wait': 'ウェイト', 'Show Picture': 'ピクチャの表示', 'Move Picture': 'ピクチャの移動', 'Rotate Picture': 'ピクチャの回転', 'Tint Picture': 'ピクチャの色調変更', 'Erase Picture': 'ピクチャの消去', 'Set Weather Effect': '天候の設定', 'Play BGM': 'BGMの演奏', 'Fadeout BGM': 'BGMのフェードアウト', 'Save BGM': 'BGMの保存', 'Replay BGM': 'BGMの再開', 'Play BGS': 'BGSの演奏', 'Fadeout BGS': 'BGSのフェードアウト', 'Play ME': 'MEの演奏', 'Play SE': 'SEの演奏', 'Stop SE': 'SEの停止', 'Play Movie': 'ムービーの再生', 'Change Map Name Display': 'マップ名表示の変更', 'Change Tileset': 'タイルセットの変更', 'Change Battle Background': '戦闘背景の変更', 'Change Parallax': '遠景の変更', 'Get Location Info': '指定位置の情報取得', 'Battle Processing': '戦闘の処理', 'Shop Processing': 'ショップの処理', 'Name Input Processing': '名前入力の処理', 'Change HP': 'HPの増減', 'Change MP': 'MPの増減', 'Change State': 'ステートの変更', 'Recover All': '全回復', 'Change EXP': '経験値の増減', 'Change Level': 'レベルの増減', 'Change Parameter': '能力値の増減', 'Change Skill': 'スキルの増減', 'Change Equipment': '装備の変更', 'Change Name': '名前の変更', 'Change Class': '職業の変更', 'Change Actor Images': 'アクター画像の変更', 'Change Vehicle Image': '乗り物画像の変更', 'Change Nickname': '二つ名の変更', 'Change Profile': 'プロフィールの変更', 'Change TP': 'TPの増減', 'Change Enemy HP': '敵キャラのHP増減', 'Change Enemy MP': '敵キャラのMP増減', 'Change Enemy State': '敵キャラのステート変更', 'Enemy Recover All': '敵キャラの全回復', 'Enemy Appear': '敵キャラの出現', 'Enemy Transform': '敵キャラの変身', 'Show Battle Animation': '戦闘アニメーションの表示', 'Force Action': '戦闘行動の強制', 'Abort Battle': '戦闘の中断', 'Change Enemy TP': '敵キャラのTP増減', 'Open Menu Screen': 'メニュー画面を開く', 'Open Save Screen': 'セーブ画面を開く', 'Game Over': 'ゲームオーバー', 'Return to Title Screen': 'タイトル画面に戻す', 'Script': 'スクリプト', 'Plugin Command': 'プラグインコマンド', 'Text': '文章', 'When': '分岐', 'When Cancel': 'キャンセル時', 'Scrolling Text': 'スクロール文章', 'Else': 'それ以外', 'Repeat Above': '以上繰り返し', 'Move Route': '移動ルート', 'If Win': '勝ったとき', 'If Escape': '逃げたとき', 'If Lose': '負けたとき', 'Shop Good': 'ショップ商品', 'Plugin Args': 'プラグイン引数'
    },
    es: {
        'End': 'Fin', 'Show Text': 'Mostrar texto', 'Show Choices': 'Mostrar opciones', 'Input Number': 'Entrada numérica', 'Select Item': 'Seleccionar objeto', 'Show Scrolling Text': 'Mostrar texto desplazado', 'Comment': 'Comentario', 'Conditional Branch': 'Condición', 'Loop': 'Bucle', 'Break Loop': 'Romper bucle', 'Exit Event Processing': 'Salir del evento', 'Exit Event': 'Salir del evento', 'Common Event': 'Evento común', 'Label': 'Etiqueta', 'Jump to Label': 'Saltar a etiqueta', 'Control Switches': 'Controlar interruptores', 'Control Variables': 'Controlar variables', 'Control Self Switch': 'Controlar interruptor local', 'Control Timer': 'Controlar temporizador', 'Change Gold': 'Cambiar oro', 'Change Items': 'Cambiar objetos', 'Change Weapons': 'Cambiar armas', 'Change Armors': 'Cambiar armaduras', 'Change Party Members': 'Cambiar miembros del grupo', 'Change Party Member': 'Cambiar miembro del grupo', 'Change Battle BGM': 'Cambiar BGM de batalla', 'Change Victory ME': 'Cambiar ME de victoria', 'Change Save Access': 'Cambiar acceso a guardar', 'Change Menu Access': 'Cambiar acceso al menú', 'Change Encounter': 'Cambiar encuentros', 'Change Formation Access': 'Cambiar formación', 'Change Window Color': 'Cambiar color de ventana', 'Change Defeat ME': 'Cambiar ME de derrota', 'Change Vehicle BGM': 'Cambiar BGM de vehículo', 'Transfer Player': 'Transferir jugador', 'Set Vehicle Location': 'Ubicar vehículo', 'Set Event Location': 'Ubicar evento', 'Scroll Map': 'Desplazar mapa', 'Set Movement Route': 'Definir ruta de movimiento', 'Get on/off Vehicle': 'Subir/bajar de vehículo', 'Change Transparency': 'Cambiar transparencia', 'Show Animation': 'Mostrar animación', 'Show Balloon Icon': 'Mostrar globo', 'Erase Event': 'Borrar evento', 'Change Player Followers': 'Cambiar seguidores', 'Gather Followers': 'Reunir seguidores', 'Fadeout Screen': 'Fundir pantalla', 'Fadein Screen': 'Aparecer pantalla', 'Tint Screen': 'Tinte de pantalla', 'Flash Screen': 'Destello de pantalla', 'Shake Screen': 'Sacudir pantalla', 'Wait': 'Esperar', 'Show Picture': 'Mostrar imagen', 'Move Picture': 'Mover imagen', 'Rotate Picture': 'Rotar imagen', 'Tint Picture': 'Tinte de imagen', 'Erase Picture': 'Borrar imagen', 'Set Weather Effect': 'Definir clima', 'Play BGM': 'Reproducir BGM', 'Fadeout BGM': 'Fundir BGM', 'Save BGM': 'Guardar BGM', 'Replay BGM': 'Reanudar BGM', 'Play BGS': 'Reproducir BGS', 'Fadeout BGS': 'Fundir BGS', 'Play ME': 'Reproducir ME', 'Play SE': 'Reproducir SE', 'Stop SE': 'Detener SE', 'Play Movie': 'Reproducir película', 'Change Map Name Display': 'Cambiar visualización del mapa', 'Change Tileset': 'Cambiar tileset', 'Change Battle Background': 'Cambiar fondo de batalla', 'Change Parallax': 'Cambiar parallax', 'Get Location Info': 'Obtener info de ubicación', 'Battle Processing': 'Procesar batalla', 'Shop Processing': 'Procesar tienda', 'Name Input Processing': 'Entrada de nombre', 'Change HP': 'Cambiar HP', 'Change MP': 'Cambiar MP', 'Change State': 'Cambiar estado', 'Recover All': 'Recuperar todo', 'Change EXP': 'Cambiar EXP', 'Change Level': 'Cambiar nivel', 'Change Parameter': 'Cambiar parámetro', 'Change Skill': 'Cambiar habilidad', 'Change Equipment': 'Cambiar equipo', 'Change Name': 'Cambiar nombre', 'Change Class': 'Cambiar clase', 'Change Actor Images': 'Cambiar imágenes de actor', 'Change Vehicle Image': 'Cambiar imagen de vehículo', 'Change Nickname': 'Cambiar apodo', 'Change Profile': 'Cambiar perfil', 'Change TP': 'Cambiar TP', 'Change Enemy HP': 'Cambiar HP enemigo', 'Change Enemy MP': 'Cambiar MP enemigo', 'Change Enemy State': 'Cambiar estado enemigo', 'Enemy Recover All': 'Recuperar enemigo', 'Enemy Appear': 'Aparecer enemigo', 'Enemy Transform': 'Transformar enemigo', 'Show Battle Animation': 'Mostrar animación de batalla', 'Force Action': 'Forzar acción', 'Abort Battle': 'Abortar batalla', 'Change Enemy TP': 'Cambiar TP enemigo', 'Open Menu Screen': 'Abrir menú', 'Open Save Screen': 'Abrir guardado', 'Game Over': 'Game Over', 'Return to Title Screen': 'Volver al título', 'Script': 'Script', 'Plugin Command': 'Comando de plugin', 'Text': 'Texto', 'When': 'Cuando', 'When Cancel': 'Al cancelar', 'Scrolling Text': 'Texto desplazado', 'Else': 'Si no', 'Repeat Above': 'Repetir arriba', 'Move Route': 'Ruta de movimiento', 'If Win': 'Si gana', 'If Escape': 'Si escapa', 'If Lose': 'Si pierde', 'Shop Good': 'Producto de tienda', 'Plugin Args': 'Argumentos de plugin'
    }
};

const RR_EVENT_SECTION_NAMES = {
    ja: { 'Message & Flow': 'メッセージとフロー', 'Map & Screen': 'マップと画面', 'Battle & System': '戦闘とシステム', 'Message': 'メッセージ', 'Game Progression': 'ゲーム進行', 'Flow Control': 'フロー制御', 'Party': 'パーティ', 'Actor': 'アクター', 'Movement': '移動', 'Character': 'キャラクター', 'Picture': 'ピクチャ', 'Timing': 'タイミング', 'Screen': '画面', 'Audio & Video': 'オーディオとビデオ', 'Scene Control': 'シーン制御', 'System Settings': 'システム設定', 'Map': 'マップ', 'Battle': '戦闘', 'Advanced': '高度' },
    es: { 'Message & Flow': 'Mensaje y flujo', 'Map & Screen': 'Mapa y pantalla', 'Battle & System': 'Batalla y sistema', 'Message': 'Mensaje', 'Game Progression': 'Progreso del juego', 'Flow Control': 'Control de flujo', 'Party': 'Grupo', 'Actor': 'Actor', 'Movement': 'Movimiento', 'Character': 'Personaje', 'Picture': 'Imagen', 'Timing': 'Tiempo', 'Screen': 'Pantalla', 'Audio & Video': 'Audio y video', 'Scene Control': 'Control de escena', 'System Settings': 'Ajustes del sistema', 'Map': 'Mapa', 'Battle': 'Batalla', 'Advanced': 'Avanzado' }
};

Object.assign(RR_EVENT_COMMAND_NAMES, {
    ru: {
        'End': 'Конец', 'Show Text': 'Показать Текст', 'Show Choices': 'Показать Выбор', 'Input Number': 'Ввод Числа', 'Select Item': 'Выбор Предмета', 'Show Scrolling Text': 'Показать Прокручиваемый Текст', 'Comment': 'Комментарий',
        'Conditional Branch': 'Условная Ветвь', 'Loop': 'Цикл', 'Break Loop': 'Прервать Цикл', 'Exit Event Processing': 'Завершить Обработку События', 'Exit Event': 'Завершить Событие', 'Common Event': 'Общее Событие', 'Label': 'Метка', 'Jump to Label': 'Перейти К Метке',
        'Control Switches': 'Управление Переключателями', 'Control Variables': 'Управление Переменными', 'Control Self Switch': 'Управление Локальным Переключателем', 'Control Timer': 'Управление Таймером',
        'Change Gold': 'Изменить Золото', 'Change Items': 'Изменить Предметы', 'Change Weapons': 'Изменить Оружие', 'Change Armors': 'Изменить Броню', 'Change Party Members': 'Изменить Состав Группы', 'Change Party Member': 'Изменить Участника Группы',
        'Change HP': 'Изменить HP', 'Change MP': 'Изменить MP', 'Change TP': 'Изменить TP', 'Change State': 'Изменить Состояние', 'Recover All': 'Полное Восстановление', 'Change EXP': 'Изменить Опыт', 'Change Level': 'Изменить Уровень', 'Change Parameter': 'Изменить Параметр', 'Change Skill': 'Изменить Навык', 'Change Equipment': 'Изменить Экипировку', 'Change Name': 'Изменить Имя', 'Change Class': 'Изменить Класс', 'Change Nickname': 'Изменить Прозвище', 'Change Profile': 'Изменить Профиль',
        'Transfer Player': 'Переместить Игрока', 'Set Vehicle Location': 'Задать Положение Транспорта', 'Set Event Location': 'Задать Положение События', 'Scroll Map': 'Прокрутить Карту', 'Set Movement Route': 'Задать Маршрут Движения', 'Get on/off Vehicle': 'Сесть/Сойти С Транспорта',
        'Change Transparency': 'Изменить Прозрачность', 'Change Player Followers': 'Изменить Спутников Игрока', 'Gather Followers': 'Собрать Спутников', 'Show Animation': 'Показать Анимацию', 'Show Balloon Icon': 'Показать Облачко', 'Erase Event': 'Стереть Событие',
        'Show Picture': 'Показать Изображение', 'Move Picture': 'Переместить Изображение', 'Rotate Picture': 'Повернуть Изображение', 'Tint Picture': 'Тонировать Изображение', 'Erase Picture': 'Стереть Изображение',
        'Wait': 'Ожидание', 'Fadeout Screen': 'Затемнить Экран', 'Fadein Screen': 'Осветлить Экран', 'Tint Screen': 'Тонировать Экран', 'Flash Screen': 'Вспышка Экрана', 'Shake Screen': 'Тряска Экрана', 'Set Weather Effect': 'Задать Погоду',
        'Play BGM': 'Играть BGM', 'Fadeout BGM': 'Затухание BGM', 'Save BGM': 'Сохранить BGM', 'Replay BGM': 'Повторить BGM', 'Play BGS': 'Играть BGS', 'Fadeout BGS': 'Затухание BGS', 'Play ME': 'Играть ME', 'Play SE': 'Играть SE', 'Stop SE': 'Остановить SE', 'Play Movie': 'Проиграть Видео',
        'Battle Processing': 'Обработка Боя', 'Shop Processing': 'Обработка Магазина', 'Name Input Processing': 'Ввод Имени', 'Open Menu Screen': 'Открыть Меню', 'Open Save Screen': 'Открыть Сохранение', 'Game Over': 'Конец Игры', 'Return to Title Screen': 'Вернуться К Титулу',
        'Change Battle BGM': 'Изменить BGM Боя', 'Change Victory ME': 'Изменить ME Победы', 'Change Save Access': 'Изменить Доступ К Сохранению', 'Change Menu Access': 'Изменить Доступ К Меню', 'Change Encounter': 'Изменить Встречи', 'Change Formation Access': 'Изменить Доступ К Построению', 'Change Window Color': 'Изменить Цвет Окна', 'Change Defeat ME': 'Изменить ME Поражения', 'Change Vehicle BGM': 'Изменить BGM Транспорта', 'Change Actor Images': 'Изменить Изображения Актёра', 'Change Vehicle Image': 'Изменить Изображение Транспорта',
        'Change Map Name Display': 'Изменить Отображение Имени Карты', 'Change Tileset': 'Изменить Тайлсет', 'Change Battle Background': 'Изменить Фон Боя', 'Change Parallax': 'Изменить Параллакс', 'Get Location Info': 'Получить Инфо О Месте',
        'Change Enemy HP': 'Изменить HP Врага', 'Change Enemy MP': 'Изменить MP Врага', 'Change Enemy TP': 'Изменить TP Врага', 'Change Enemy State': 'Изменить Состояние Врага', 'Enemy Recover All': 'Полное Восстановление Врага', 'Enemy Appear': 'Появление Врага', 'Enemy Transform': 'Превратить Врага', 'Show Battle Animation': 'Показать Боевую Анимацию', 'Force Action': 'Принудительное Действие', 'Abort Battle': 'Прервать Бой',
        'Script': 'Скрипт', 'Plugin Command': 'Команда Плагина'
    }
});

Object.assign(RR_EVENT_SECTION_NAMES, {
    ru: { 'Message & Flow': 'Сообщения И Поток', 'Map & Screen': 'Карта И Экран', 'Battle & System': 'Бой И Система', 'Message': 'Сообщения', 'Game Progression': 'Прогресс Игры', 'Flow Control': 'Управление Потоком', 'Party': 'Группа', 'Actor': 'Актёр', 'Movement': 'Движение', 'Character': 'Персонаж', 'Picture': 'Изображение', 'Timing': 'Время', 'Screen': 'Экран', 'Audio & Video': 'Аудио И Видео', 'Scene Control': 'Управление Сценой', 'System Settings': 'Системные Настройки', 'Map': 'Карта', 'Battle': 'Бой', 'Advanced': 'Дополнительно' }
});

Object.assign(RR_EVENT_COMMAND_NAMES, {
    'zh-Hant': {
        'End': '結束', 'Show Text': '顯示文字', 'Show Choices': '顯示選項', 'Input Number': '輸入數字', 'Select Item': '選擇物品', 'Show Scrolling Text': '顯示捲動文字', 'Comment': '註解',
        'Conditional Branch': '條件分歧', 'Loop': '迴圈', 'Break Loop': '中斷迴圈', 'Exit Event Processing': '結束事件處理', 'Exit Event': '結束事件', 'Common Event': '共通事件', 'Label': '標籤', 'Jump to Label': '跳至標籤',
        'Control Switches': '控制開關', 'Control Variables': '控制變數', 'Control Self Switch': '控制自開關', 'Control Timer': '控制計時器',
        'Change Gold': '變更金錢', 'Change Items': '變更物品', 'Change Weapons': '變更武器', 'Change Armors': '變更防具', 'Change Party Members': '變更隊伍成員', 'Change Party Member': '變更隊伍成員',
        'Change HP': '變更 HP', 'Change MP': '變更 MP', 'Change TP': '變更 TP', 'Change State': '變更狀態', 'Recover All': '完全恢復', 'Change EXP': '變更經驗值', 'Change Level': '變更等級', 'Change Parameter': '變更參數', 'Change Skill': '變更技能', 'Change Equipment': '變更裝備', 'Change Name': '變更名稱', 'Change Class': '變更職業', 'Change Nickname': '變更暱稱', 'Change Profile': '變更簡介',
        'Transfer Player': '玩家移動', 'Set Vehicle Location': '設定載具位置', 'Set Event Location': '設定事件位置', 'Scroll Map': '捲動地圖', 'Set Movement Route': '設定移動路線', 'Get on/off Vehicle': '上下載具',
        'Change Transparency': '變更透明度', 'Change Player Followers': '變更玩家跟隨者', 'Gather Followers': '集合跟隨者', 'Show Animation': '顯示動畫', 'Show Balloon Icon': '顯示氣泡圖示', 'Erase Event': '消除事件',
        'Show Picture': '顯示圖片', 'Move Picture': '移動圖片', 'Rotate Picture': '旋轉圖片', 'Tint Picture': '圖片色調', 'Erase Picture': '消除圖片',
        'Wait': '等待', 'Fadeout Screen': '淡出畫面', 'Fadein Screen': '淡入畫面', 'Tint Screen': '畫面色調', 'Flash Screen': '畫面閃爍', 'Shake Screen': '畫面震動', 'Set Weather Effect': '設定天氣效果',
        'Play BGM': '播放 BGM', 'Fadeout BGM': '淡出 BGM', 'Save BGM': '儲存 BGM', 'Replay BGM': '重播 BGM', 'Play BGS': '播放 BGS', 'Fadeout BGS': '淡出 BGS', 'Play ME': '播放 ME', 'Play SE': '播放 SE', 'Stop SE': '停止 SE', 'Play Movie': '播放影片',
        'Battle Processing': '戰鬥處理', 'Shop Processing': '商店處理', 'Name Input Processing': '名稱輸入處理', 'Open Menu Screen': '開啟選單畫面', 'Open Save Screen': '開啟存檔畫面', 'Game Over': '遊戲結束', 'Return to Title Screen': '返回標題畫面',
        'Change Battle BGM': '變更戰鬥 BGM', 'Change Victory ME': '變更勝利 ME', 'Change Save Access': '變更存檔權限', 'Change Menu Access': '變更選單權限', 'Change Encounter': '變更遇敵', 'Change Formation Access': '變更編隊權限', 'Change Window Color': '變更視窗顏色', 'Change Defeat ME': '變更敗北 ME', 'Change Vehicle BGM': '變更載具 BGM', 'Change Actor Images': '變更角色圖像', 'Change Vehicle Image': '變更載具圖像',
        'Change Map Name Display': '變更地圖名稱顯示', 'Change Tileset': '變更圖塊組', 'Change Battle Background': '變更戰鬥背景', 'Change Parallax': '變更遠景', 'Get Location Info': '取得位置資訊',
        'Change Enemy HP': '變更敵人 HP', 'Change Enemy MP': '變更敵人 MP', 'Change Enemy TP': '變更敵人 TP', 'Change Enemy State': '變更敵人狀態', 'Enemy Recover All': '敵人完全恢復', 'Enemy Appear': '敵人出現', 'Enemy Transform': '敵人變身', 'Show Battle Animation': '顯示戰鬥動畫', 'Force Action': '強制行動', 'Abort Battle': '中止戰鬥',
        'Script': '腳本', 'Plugin Command': '外掛指令'
    },
    'zh-Hans': {
        'End': '结束', 'Show Text': '显示文本', 'Show Choices': '显示选项', 'Input Number': '输入数字', 'Select Item': '选择物品', 'Show Scrolling Text': '显示滚动文本', 'Comment': '注释',
        'Conditional Branch': '条件分支', 'Loop': '循环', 'Break Loop': '中断循环', 'Exit Event Processing': '结束事件处理', 'Exit Event': '结束事件', 'Common Event': '公共事件', 'Label': '标签', 'Jump to Label': '跳至标签',
        'Control Switches': '控制开关', 'Control Variables': '控制变量', 'Control Self Switch': '控制自开关', 'Control Timer': '控制计时器',
        'Change Gold': '更改金钱', 'Change Items': '更改物品', 'Change Weapons': '更改武器', 'Change Armors': '更改防具', 'Change Party Members': '更改队伍成员', 'Change Party Member': '更改队伍成员',
        'Change HP': '更改 HP', 'Change MP': '更改 MP', 'Change TP': '更改 TP', 'Change State': '更改状态', 'Recover All': '完全恢复', 'Change EXP': '更改经验值', 'Change Level': '更改等级', 'Change Parameter': '更改参数', 'Change Skill': '更改技能', 'Change Equipment': '更改装备', 'Change Name': '更改名称', 'Change Class': '更改职业', 'Change Nickname': '更改昵称', 'Change Profile': '更改简介',
        'Transfer Player': '玩家移动', 'Set Vehicle Location': '设置载具位置', 'Set Event Location': '设置事件位置', 'Scroll Map': '滚动地图', 'Set Movement Route': '设置移动路线', 'Get on/off Vehicle': '上下载具',
        'Change Transparency': '更改透明度', 'Change Player Followers': '更改玩家跟随者', 'Gather Followers': '集合跟随者', 'Show Animation': '显示动画', 'Show Balloon Icon': '显示气泡图标', 'Erase Event': '消除事件',
        'Show Picture': '显示图片', 'Move Picture': '移动图片', 'Rotate Picture': '旋转图片', 'Tint Picture': '图片色调', 'Erase Picture': '消除图片',
        'Wait': '等待', 'Fadeout Screen': '淡出画面', 'Fadein Screen': '淡入画面', 'Tint Screen': '画面色调', 'Flash Screen': '画面闪烁', 'Shake Screen': '画面震动', 'Set Weather Effect': '设置天气效果',
        'Play BGM': '播放 BGM', 'Fadeout BGM': '淡出 BGM', 'Save BGM': '保存 BGM', 'Replay BGM': '重播 BGM', 'Play BGS': '播放 BGS', 'Fadeout BGS': '淡出 BGS', 'Play ME': '播放 ME', 'Play SE': '播放 SE', 'Stop SE': '停止 SE', 'Play Movie': '播放影片',
        'Battle Processing': '战斗处理', 'Shop Processing': '商店处理', 'Name Input Processing': '名称输入处理', 'Open Menu Screen': '打开菜单画面', 'Open Save Screen': '打开存档画面', 'Game Over': '游戏结束', 'Return to Title Screen': '返回标题画面',
        'Change Battle BGM': '更改战斗 BGM', 'Change Victory ME': '更改胜利 ME', 'Change Save Access': '更改存档权限', 'Change Menu Access': '更改菜单权限', 'Change Encounter': '更改遇敌', 'Change Formation Access': '更改编队权限', 'Change Window Color': '更改窗口颜色', 'Change Defeat ME': '更改失败 ME', 'Change Vehicle BGM': '更改载具 BGM', 'Change Actor Images': '更改角色图像', 'Change Vehicle Image': '更改载具图像',
        'Change Map Name Display': '更改地图名称显示', 'Change Tileset': '更改图块组', 'Change Battle Background': '更改战斗背景', 'Change Parallax': '更改远景', 'Get Location Info': '获取位置信息',
        'Change Enemy HP': '更改敌人 HP', 'Change Enemy MP': '更改敌人 MP', 'Change Enemy TP': '更改敌人 TP', 'Change Enemy State': '更改敌人状态', 'Enemy Recover All': '敌人完全恢复', 'Enemy Appear': '敌人出现', 'Enemy Transform': '敌人变身', 'Show Battle Animation': '显示战斗动画', 'Force Action': '强制行动', 'Abort Battle': '中止战斗',
        'Script': '脚本', 'Plugin Command': '插件指令'
    },
    pt: {
        'End': 'Fim', 'Show Text': 'Mostrar Texto', 'Show Choices': 'Mostrar Escolhas', 'Input Number': 'Entrada Numérica', 'Select Item': 'Selecionar Item', 'Show Scrolling Text': 'Mostrar Texto Rolante', 'Comment': 'Comentário',
        'Conditional Branch': 'Ramo Condicional', 'Loop': 'Loop', 'Break Loop': 'Interromper Loop', 'Exit Event Processing': 'Sair Do Processamento Do Evento', 'Exit Event': 'Sair Do Evento', 'Common Event': 'Evento Comum', 'Label': 'Rótulo', 'Jump to Label': 'Ir Para Rótulo',
        'Control Switches': 'Controlar Interruptores', 'Control Variables': 'Controlar Variáveis', 'Control Self Switch': 'Controlar Interruptor Local', 'Control Timer': 'Controlar Temporizador',
        'Change Gold': 'Alterar Ouro', 'Change Items': 'Alterar Itens', 'Change Weapons': 'Alterar Armas', 'Change Armors': 'Alterar Armaduras', 'Change Party Members': 'Alterar Membros Do Grupo', 'Change Party Member': 'Alterar Membro Do Grupo',
        'Change HP': 'Alterar HP', 'Change MP': 'Alterar MP', 'Change TP': 'Alterar TP', 'Change State': 'Alterar Estado', 'Recover All': 'Recuperar Tudo', 'Change EXP': 'Alterar EXP', 'Change Level': 'Alterar Nível', 'Change Parameter': 'Alterar Parâmetro', 'Change Skill': 'Alterar Habilidade', 'Change Equipment': 'Alterar Equipamento', 'Change Name': 'Alterar Nome', 'Change Class': 'Alterar Classe', 'Change Nickname': 'Alterar Apelido', 'Change Profile': 'Alterar Perfil',
        'Transfer Player': 'Transferir Jogador', 'Set Vehicle Location': 'Definir Local Do Veículo', 'Set Event Location': 'Definir Local Do Evento', 'Scroll Map': 'Rolar Mapa', 'Set Movement Route': 'Definir Rota De Movimento', 'Get on/off Vehicle': 'Entrar/Sair Do Veículo',
        'Change Transparency': 'Alterar Transparência', 'Change Player Followers': 'Alterar Seguidores Do Jogador', 'Gather Followers': 'Reunir Seguidores', 'Show Animation': 'Mostrar Animação', 'Show Balloon Icon': 'Mostrar Ícone De Balão', 'Erase Event': 'Apagar Evento',
        'Show Picture': 'Mostrar Imagem', 'Move Picture': 'Mover Imagem', 'Rotate Picture': 'Girar Imagem', 'Tint Picture': 'Tingir Imagem', 'Erase Picture': 'Apagar Imagem',
        'Wait': 'Esperar', 'Fadeout Screen': 'Escurecer Tela', 'Fadein Screen': 'Clarear Tela', 'Tint Screen': 'Tingir Tela', 'Flash Screen': 'Flash Na Tela', 'Shake Screen': 'Tremer Tela', 'Set Weather Effect': 'Definir Clima',
        'Play BGM': 'Reproduzir BGM', 'Fadeout BGM': 'Fadeout BGM', 'Save BGM': 'Salvar BGM', 'Replay BGM': 'Repetir BGM', 'Play BGS': 'Reproduzir BGS', 'Fadeout BGS': 'Fadeout BGS', 'Play ME': 'Reproduzir ME', 'Play SE': 'Reproduzir SE', 'Stop SE': 'Parar SE', 'Play Movie': 'Reproduzir Filme',
        'Battle Processing': 'Processamento De Batalha', 'Shop Processing': 'Processamento De Loja', 'Name Input Processing': 'Entrada De Nome', 'Open Menu Screen': 'Abrir Tela De Menu', 'Open Save Screen': 'Abrir Tela De Salvamento', 'Game Over': 'Fim De Jogo', 'Return to Title Screen': 'Voltar À Tela De Título',
        'Change Battle BGM': 'Alterar BGM De Batalha', 'Change Victory ME': 'Alterar ME De Vitória', 'Change Save Access': 'Alterar Acesso Ao Salvamento', 'Change Menu Access': 'Alterar Acesso Ao Menu', 'Change Encounter': 'Alterar Encontros', 'Change Formation Access': 'Alterar Acesso À Formação', 'Change Window Color': 'Alterar Cor Da Janela', 'Change Defeat ME': 'Alterar ME De Derrota', 'Change Vehicle BGM': 'Alterar BGM Do Veículo', 'Change Actor Images': 'Alterar Imagens Do Ator', 'Change Vehicle Image': 'Alterar Imagem Do Veículo',
        'Change Map Name Display': 'Alterar Exibição Do Nome Do Mapa', 'Change Tileset': 'Alterar Tileset', 'Change Battle Background': 'Alterar Fundo De Batalha', 'Change Parallax': 'Alterar Paralaxe', 'Get Location Info': 'Obter Info Do Local',
        'Change Enemy HP': 'Alterar HP Do Inimigo', 'Change Enemy MP': 'Alterar MP Do Inimigo', 'Change Enemy TP': 'Alterar TP Do Inimigo', 'Change Enemy State': 'Alterar Estado Do Inimigo', 'Enemy Recover All': 'Recuperar Inimigo Totalmente', 'Enemy Appear': 'Aparecer Inimigo', 'Enemy Transform': 'Transformar Inimigo', 'Show Battle Animation': 'Mostrar Animação De Batalha', 'Force Action': 'Forçar Ação', 'Abort Battle': 'Abortar Batalha',
        'Script': 'Código', 'Plugin Command': 'Comando De Plugin'
    }
});

Object.assign(RR_EVENT_SECTION_NAMES, {
    'zh-Hant': { 'Message & Flow': '訊息與流程', 'Map & Screen': '地圖與畫面', 'Battle & System': '戰鬥與系統', 'Message': '訊息', 'Game Progression': '遊戲進行', 'Flow Control': '流程控制', 'Party': '隊伍', 'Actor': '角色', 'Movement': '移動', 'Character': '角色', 'Picture': '圖片', 'Timing': '時間', 'Screen': '畫面', 'Audio & Video': '音訊與影片', 'Scene Control': '場景控制', 'System Settings': '系統設定', 'Map': '地圖', 'Battle': '戰鬥', 'Advanced': '進階' },
    'zh-Hans': { 'Message & Flow': '消息与流程', 'Map & Screen': '地图与画面', 'Battle & System': '战斗与系统', 'Message': '消息', 'Game Progression': '游戏进行', 'Flow Control': '流程控制', 'Party': '队伍', 'Actor': '角色', 'Movement': '移动', 'Character': '角色', 'Picture': '图片', 'Timing': '时间', 'Screen': '画面', 'Audio & Video': '音频与视频', 'Scene Control': '场景控制', 'System Settings': '系统设置', 'Map': '地图', 'Battle': '战斗', 'Advanced': '高级' },
    pt: { 'Message & Flow': 'Mensagem E Fluxo', 'Map & Screen': 'Mapa E Tela', 'Battle & System': 'Batalha E Sistema', 'Message': 'Mensagem', 'Game Progression': 'Progressão Do Jogo', 'Flow Control': 'Controle De Fluxo', 'Party': 'Grupo', 'Actor': 'Ator', 'Movement': 'Movimento', 'Character': 'Personagem', 'Picture': 'Imagem', 'Timing': 'Tempo', 'Screen': 'Tela', 'Audio & Video': 'Áudio E Vídeo', 'Scene Control': 'Controle De Cena', 'System Settings': 'Configurações Do Sistema', 'Map': 'Mapa', 'Battle': 'Batalha', 'Advanced': 'Avançado' }
});

Object.assign(RR_EVENT_COMMAND_NAMES, {
    de: {
        'End': 'Ende', 'Show Text': 'Text anzeigen', 'Show Choices': 'Auswahl anzeigen', 'Input Number': 'Zahl eingeben', 'Select Item': 'Gegenstand auswählen', 'Show Scrolling Text': 'Lauftext anzeigen', 'Comment': 'Kommentar',
        'Conditional Branch': 'Bedingte Verzweigung', 'Loop': 'Schleife', 'Break Loop': 'Schleife abbrechen', 'Exit Event Processing': 'Ereignisverarbeitung beenden', 'Exit Event': 'Ereignis beenden', 'Common Event': 'Gemeinsames Ereignis', 'Label': 'Label', 'Jump to Label': 'Zu Label springen',
        'Control Switches': 'Schalter steuern', 'Control Variables': 'Variablen steuern', 'Control Self Switch': 'Selbstschalter steuern', 'Control Timer': 'Timer steuern',
        'Change Gold': 'Gold ändern', 'Change Items': 'Gegenstände ändern', 'Change Weapons': 'Waffen ändern', 'Change Armors': 'Rüstungen ändern', 'Change Party Members': 'Gruppenmitglieder ändern', 'Change Party Member': 'Gruppenmitglied ändern',
        'Change HP': 'HP ändern', 'Change MP': 'MP ändern', 'Change TP': 'TP ändern', 'Change State': 'Zustand ändern', 'Recover All': 'Alles heilen', 'Change EXP': 'EXP ändern', 'Change Level': 'Level ändern', 'Change Parameter': 'Parameter ändern', 'Change Skill': 'Fähigkeit ändern', 'Change Equipment': 'Ausrüstung ändern', 'Change Name': 'Name ändern', 'Change Class': 'Klasse ändern', 'Change Nickname': 'Spitzname ändern', 'Change Profile': 'Profil ändern',
        'Transfer Player': 'Spieler transferieren', 'Set Vehicle Location': 'Fahrzeugposition setzen', 'Set Event Location': 'Ereignisposition setzen', 'Scroll Map': 'Karte scrollen', 'Set Movement Route': 'Bewegungsroute festlegen', 'Get on/off Vehicle': 'Fahrzeug ein-/aussteigen',
        'Change Transparency': 'Transparenz ändern', 'Change Player Followers': 'Begleiter ändern', 'Gather Followers': 'Begleiter sammeln', 'Show Animation': 'Animation anzeigen', 'Show Balloon Icon': 'Sprechblasenicon anzeigen', 'Erase Event': 'Ereignis löschen',
        'Show Picture': 'Bild anzeigen', 'Move Picture': 'Bild bewegen', 'Rotate Picture': 'Bild drehen', 'Tint Picture': 'Bild einfärben', 'Erase Picture': 'Bild löschen',
        'Wait': 'Warten', 'Fadeout Screen': 'Bildschirm ausblenden', 'Fadein Screen': 'Bildschirm einblenden', 'Tint Screen': 'Bildschirm einfärben', 'Flash Screen': 'Bildschirm aufblitzen', 'Shake Screen': 'Bildschirm erschüttern', 'Set Weather Effect': 'Wettereffekt setzen',
        'Play BGM': 'BGM abspielen', 'Fadeout BGM': 'BGM ausblenden', 'Save BGM': 'BGM speichern', 'Replay BGM': 'BGM wiedergeben', 'Play BGS': 'BGS abspielen', 'Fadeout BGS': 'BGS ausblenden', 'Play ME': 'ME abspielen', 'Play SE': 'SE abspielen', 'Stop SE': 'SE stoppen', 'Play Movie': 'Film abspielen',
        'Battle Processing': 'Kampfverarbeitung', 'Shop Processing': 'Shop-Verarbeitung', 'Name Input Processing': 'Namenseingabe', 'Open Menu Screen': 'Menü öffnen', 'Open Save Screen': 'Speichern öffnen', 'Game Over': 'Game Over', 'Return to Title Screen': 'Zum Titelbildschirm',
        'Change Battle BGM': 'Kampf-BGM ändern', 'Change Victory ME': 'Sieges-ME ändern', 'Change Save Access': 'Speicherzugriff ändern', 'Change Menu Access': 'Menüzugriff ändern', 'Change Encounter': 'Begegnungen ändern', 'Change Formation Access': 'Formationszugriff ändern', 'Change Window Color': 'Fensterfarbe ändern', 'Change Defeat ME': 'Niederlagen-ME ändern', 'Change Vehicle BGM': 'Fahrzeug-BGM ändern', 'Change Actor Images': 'Akteurbilder ändern', 'Change Vehicle Image': 'Fahrzeugbild ändern',
        'Change Map Name Display': 'Kartennamenanzeige ändern', 'Change Tileset': 'Tileset ändern', 'Change Battle Background': 'Kampfhintergrund ändern', 'Change Parallax': 'Parallax ändern', 'Get Location Info': 'Positionsinfo abrufen',
        'Change Enemy HP': 'Gegner-HP ändern', 'Change Enemy MP': 'Gegner-MP ändern', 'Change Enemy TP': 'Gegner-TP ändern', 'Change Enemy State': 'Gegnerzustand ändern', 'Enemy Recover All': 'Gegner komplett heilen', 'Enemy Appear': 'Gegner erscheinen', 'Enemy Transform': 'Gegner verwandeln', 'Show Battle Animation': 'Kampfanimation anzeigen', 'Force Action': 'Aktion erzwingen', 'Abort Battle': 'Kampf abbrechen',
        'Script': 'Skript', 'Plugin Command': 'Plugin-Befehl'
    },
    fr: {
        'End': 'Fin', 'Show Text': 'Afficher le texte', 'Show Choices': 'Afficher les choix', 'Input Number': 'Saisie numérique', 'Select Item': 'Sélectionner un objet', 'Show Scrolling Text': 'Afficher un texte défilant', 'Comment': 'Commentaire',
        'Conditional Branch': 'Branche conditionnelle', 'Loop': 'Boucle', 'Break Loop': 'Rompre la boucle', 'Exit Event Processing': 'Quitter le traitement d’événement', 'Exit Event': 'Quitter l’événement', 'Common Event': 'Événement commun', 'Label': 'Étiquette', 'Jump to Label': 'Sauter à l’étiquette',
        'Control Switches': 'Contrôler les interrupteurs', 'Control Variables': 'Contrôler les variables', 'Control Self Switch': 'Contrôler l’interrupteur local', 'Control Timer': 'Contrôler le minuteur',
        'Change Gold': 'Modifier l’or', 'Change Items': 'Modifier les objets', 'Change Weapons': 'Modifier les armes', 'Change Armors': 'Modifier les armures', 'Change Party Members': 'Modifier les membres du groupe', 'Change Party Member': 'Modifier un membre du groupe',
        'Change HP': 'Modifier les HP', 'Change MP': 'Modifier les MP', 'Change TP': 'Modifier les TP', 'Change State': 'Modifier l’état', 'Recover All': 'Tout récupérer', 'Change EXP': 'Modifier l’EXP', 'Change Level': 'Modifier le niveau', 'Change Parameter': 'Modifier le paramètre', 'Change Skill': 'Modifier la compétence', 'Change Equipment': 'Modifier l’équipement', 'Change Name': 'Modifier le nom', 'Change Class': 'Modifier la classe', 'Change Nickname': 'Modifier le surnom', 'Change Profile': 'Modifier le profil',
        'Transfer Player': 'Transférer le joueur', 'Set Vehicle Location': 'Définir la position du véhicule', 'Set Event Location': 'Définir la position de l’événement', 'Scroll Map': 'Faire défiler la carte', 'Set Movement Route': 'Définir l’itinéraire', 'Get on/off Vehicle': 'Monter/descendre du véhicule',
        'Change Transparency': 'Modifier la transparence', 'Change Player Followers': 'Modifier les suiveurs', 'Gather Followers': 'Rassembler les suiveurs', 'Show Animation': 'Afficher l’animation', 'Show Balloon Icon': 'Afficher l’icône de bulle', 'Erase Event': 'Effacer l’événement',
        'Show Picture': 'Afficher l’image', 'Move Picture': 'Déplacer l’image', 'Rotate Picture': 'Faire pivoter l’image', 'Tint Picture': 'Teinter l’image', 'Erase Picture': 'Effacer l’image',
        'Wait': 'Attendre', 'Fadeout Screen': 'Fondu sortant écran', 'Fadein Screen': 'Fondu entrant écran', 'Tint Screen': 'Teinter l’écran', 'Flash Screen': 'Flash écran', 'Shake Screen': 'Secouer l’écran', 'Set Weather Effect': 'Définir la météo',
        'Play BGM': 'Lire BGM', 'Fadeout BGM': 'Fondu sortant BGM', 'Save BGM': 'Sauvegarder BGM', 'Replay BGM': 'Relire BGM', 'Play BGS': 'Lire BGS', 'Fadeout BGS': 'Fondu sortant BGS', 'Play ME': 'Lire ME', 'Play SE': 'Lire SE', 'Stop SE': 'Arrêter SE', 'Play Movie': 'Lire la vidéo',
        'Battle Processing': 'Traitement du combat', 'Shop Processing': 'Traitement de boutique', 'Name Input Processing': 'Saisie du nom', 'Open Menu Screen': 'Ouvrir le menu', 'Open Save Screen': 'Ouvrir la sauvegarde', 'Game Over': 'Game Over', 'Return to Title Screen': 'Retour à l’écran titre',
        'Change Battle BGM': 'Modifier BGM de combat', 'Change Victory ME': 'Modifier ME de victoire', 'Change Save Access': 'Modifier l’accès sauvegarde', 'Change Menu Access': 'Modifier l’accès menu', 'Change Encounter': 'Modifier les rencontres', 'Change Formation Access': 'Modifier l’accès formation', 'Change Window Color': 'Modifier la couleur de fenêtre', 'Change Defeat ME': 'Modifier ME de défaite', 'Change Vehicle BGM': 'Modifier BGM du véhicule', 'Change Actor Images': 'Modifier les images d’acteur', 'Change Vehicle Image': 'Modifier l’image du véhicule',
        'Change Map Name Display': 'Modifier l’affichage du nom de carte', 'Change Tileset': 'Modifier le tileset', 'Change Battle Background': 'Modifier le fond de combat', 'Change Parallax': 'Modifier le parallaxe', 'Get Location Info': 'Obtenir les infos de position',
        'Change Enemy HP': 'Modifier HP ennemi', 'Change Enemy MP': 'Modifier MP ennemi', 'Change Enemy TP': 'Modifier TP ennemi', 'Change Enemy State': 'Modifier état ennemi', 'Enemy Recover All': 'Récupération complète ennemi', 'Enemy Appear': 'Apparition ennemi', 'Enemy Transform': 'Transformation ennemi', 'Show Battle Animation': 'Afficher animation de combat', 'Force Action': 'Forcer l’action', 'Abort Battle': 'Abandonner le combat',
        'Script': 'Commande script', 'Plugin Command': 'Commande plugin'
    },
    el: {
        'End': 'Τέλος', 'Show Text': 'Εμφάνιση κειμένου', 'Show Choices': 'Εμφάνιση επιλογών', 'Input Number': 'Εισαγωγή αριθμού', 'Select Item': 'Επιλογή αντικειμένου', 'Show Scrolling Text': 'Εμφάνιση κυλιόμενου κειμένου', 'Comment': 'Σχόλιο',
        'Conditional Branch': 'Συνθήκη διακλάδωσης', 'Loop': 'Βρόχος', 'Break Loop': 'Διακοπή βρόχου', 'Exit Event Processing': 'Έξοδος από επεξεργασία γεγονότος', 'Exit Event': 'Έξοδος από γεγονός', 'Common Event': 'Κοινό γεγονός', 'Label': 'Ετικέτα', 'Jump to Label': 'Μετάβαση σε ετικέτα',
        'Control Switches': 'Έλεγχος διακοπτών', 'Control Variables': 'Έλεγχος μεταβλητών', 'Control Self Switch': 'Έλεγχος τοπικού διακόπτη', 'Control Timer': 'Έλεγχος χρονομέτρου',
        'Change Gold': 'Αλλαγή χρυσού', 'Change Items': 'Αλλαγή αντικειμένων', 'Change Weapons': 'Αλλαγή όπλων', 'Change Armors': 'Αλλαγή πανοπλιών', 'Change Party Members': 'Αλλαγή μελών ομάδας', 'Change Party Member': 'Αλλαγή μέλους ομάδας',
        'Change HP': 'Αλλαγή HP', 'Change MP': 'Αλλαγή MP', 'Change TP': 'Αλλαγή TP', 'Change State': 'Αλλαγή κατάστασης', 'Recover All': 'Πλήρης ανάκτηση', 'Change EXP': 'Αλλαγή EXP', 'Change Level': 'Αλλαγή επιπέδου', 'Change Parameter': 'Αλλαγή παραμέτρου', 'Change Skill': 'Αλλαγή δεξιότητας', 'Change Equipment': 'Αλλαγή εξοπλισμού', 'Change Name': 'Αλλαγή ονόματος', 'Change Class': 'Αλλαγή κλάσης', 'Change Nickname': 'Αλλαγή ψευδωνύμου', 'Change Profile': 'Αλλαγή προφίλ',
        'Transfer Player': 'Μεταφορά παίκτη', 'Set Vehicle Location': 'Ορισμός θέσης οχήματος', 'Set Event Location': 'Ορισμός θέσης γεγονότος', 'Scroll Map': 'Κύλιση χάρτη', 'Set Movement Route': 'Ορισμός διαδρομής κίνησης', 'Get on/off Vehicle': 'Είσοδος/έξοδος από όχημα',
        'Change Transparency': 'Αλλαγή διαφάνειας', 'Change Player Followers': 'Αλλαγή ακολούθων παίκτη', 'Gather Followers': 'Συγκέντρωση ακολούθων', 'Show Animation': 'Εμφάνιση animation', 'Show Balloon Icon': 'Εμφάνιση εικονιδίου φυσαλίδας', 'Erase Event': 'Διαγραφή γεγονότος',
        'Show Picture': 'Εμφάνιση εικόνας', 'Move Picture': 'Μετακίνηση εικόνας', 'Rotate Picture': 'Περιστροφή εικόνας', 'Tint Picture': 'Χρωματισμός εικόνας', 'Erase Picture': 'Διαγραφή εικόνας',
        'Wait': 'Αναμονή', 'Fadeout Screen': 'Σβήσιμο οθόνης', 'Fadein Screen': 'Εμφάνιση οθόνης', 'Tint Screen': 'Χρωματισμός οθόνης', 'Flash Screen': 'Λάμψη οθόνης', 'Shake Screen': 'Κούνημα οθόνης', 'Set Weather Effect': 'Ορισμός καιρού',
        'Play BGM': 'Αναπαραγωγή BGM', 'Fadeout BGM': 'Σβήσιμο BGM', 'Save BGM': 'Αποθήκευση BGM', 'Replay BGM': 'Επανάληψη BGM', 'Play BGS': 'Αναπαραγωγή BGS', 'Fadeout BGS': 'Σβήσιμο BGS', 'Play ME': 'Αναπαραγωγή ME', 'Play SE': 'Αναπαραγωγή SE', 'Stop SE': 'Διακοπή SE', 'Play Movie': 'Αναπαραγωγή ταινίας',
        'Battle Processing': 'Επεξεργασία μάχης', 'Shop Processing': 'Επεξεργασία καταστήματος', 'Name Input Processing': 'Εισαγωγή ονόματος', 'Open Menu Screen': 'Άνοιγμα μενού', 'Open Save Screen': 'Άνοιγμα αποθήκευσης', 'Game Over': 'Game Over', 'Return to Title Screen': 'Επιστροφή στον τίτλο',
        'Change Battle BGM': 'Αλλαγή BGM μάχης', 'Change Victory ME': 'Αλλαγή ME νίκης', 'Change Save Access': 'Αλλαγή πρόσβασης αποθήκευσης', 'Change Menu Access': 'Αλλαγή πρόσβασης μενού', 'Change Encounter': 'Αλλαγή συναντήσεων', 'Change Formation Access': 'Αλλαγή πρόσβασης σχηματισμού', 'Change Window Color': 'Αλλαγή χρώματος παραθύρου', 'Change Defeat ME': 'Αλλαγή ME ήττας', 'Change Vehicle BGM': 'Αλλαγή BGM οχήματος', 'Change Actor Images': 'Αλλαγή εικόνων ηθοποιού', 'Change Vehicle Image': 'Αλλαγή εικόνας οχήματος',
        'Change Map Name Display': 'Αλλαγή εμφάνισης ονόματος χάρτη', 'Change Tileset': 'Αλλαγή tileset', 'Change Battle Background': 'Αλλαγή φόντου μάχης', 'Change Parallax': 'Αλλαγή parallax', 'Get Location Info': 'Λήψη πληροφοριών θέσης',
        'Change Enemy HP': 'Αλλαγή HP εχθρού', 'Change Enemy MP': 'Αλλαγή MP εχθρού', 'Change Enemy TP': 'Αλλαγή TP εχθρού', 'Change Enemy State': 'Αλλαγή κατάστασης εχθρού', 'Enemy Recover All': 'Πλήρης ανάκτηση εχθρού', 'Enemy Appear': 'Εμφάνιση εχθρού', 'Enemy Transform': 'Μεταμόρφωση εχθρού', 'Show Battle Animation': 'Εμφάνιση animation μάχης', 'Force Action': 'Εξαναγκασμένη ενέργεια', 'Abort Battle': 'Ακύρωση μάχης',
        'Script': 'Σενάριο', 'Plugin Command': 'Εντολή plugin'
    }
});

Object.assign(RR_EVENT_SECTION_NAMES, {
    de: { 'Message & Flow': 'Nachricht & Ablauf', 'Map & Screen': 'Karte & Bildschirm', 'Battle & System': 'Kampf & System', 'Message': 'Nachricht', 'Game Progression': 'Spielfortschritt', 'Flow Control': 'Ablaufsteuerung', 'Party': 'Gruppe', 'Actor': 'Akteur', 'Movement': 'Bewegung', 'Character': 'Charakter', 'Picture': 'Bild', 'Timing': 'Timing', 'Screen': 'Bildschirm', 'Audio & Video': 'Audio & Video', 'Scene Control': 'Szenensteuerung', 'System Settings': 'Systemeinstellungen', 'Map': 'Karte', 'Battle': 'Kampf', 'Advanced': 'Erweitert' },
    fr: { 'Message & Flow': 'Message et flux', 'Map & Screen': 'Carte et écran', 'Battle & System': 'Combat et système', 'Message': 'Message', 'Game Progression': 'Progression du jeu', 'Flow Control': 'Contrôle du flux', 'Party': 'Groupe', 'Actor': 'Acteur', 'Movement': 'Mouvement', 'Character': 'Personnage', 'Picture': 'Image', 'Timing': 'Temps', 'Screen': 'Écran', 'Audio & Video': 'Audio et vidéo', 'Scene Control': 'Contrôle de scène', 'System Settings': 'Paramètres système', 'Map': 'Carte', 'Battle': 'Combat', 'Advanced': 'Avancé' },
    el: { 'Message & Flow': 'Μήνυμα & Ροή', 'Map & Screen': 'Χάρτης & Οθόνη', 'Battle & System': 'Μάχη & Σύστημα', 'Message': 'Μήνυμα', 'Game Progression': 'Πρόοδος παιχνιδιού', 'Flow Control': 'Έλεγχος ροής', 'Party': 'Ομάδα', 'Actor': 'Ηθοποιός', 'Movement': 'Κίνηση', 'Character': 'Χαρακτήρας', 'Picture': 'Εικόνα', 'Timing': 'Χρονισμός', 'Screen': 'Οθόνη', 'Audio & Video': 'Ήχος & Βίντεο', 'Scene Control': 'Έλεγχος σκηνής', 'System Settings': 'Ρυθμίσεις συστήματος', 'Map': 'Χάρτης', 'Battle': 'Μάχη', 'Advanced': 'Προχωρημένα' }
});

const RR_I18N_STRINGS = {
    en: {
        'app.loading': 'Loading...',
        'menu.file': 'File',
        'menu.newProject': 'New Project',
        'menu.openProject': 'Open Project',
        'menu.closeProject': 'Close Project',
        'menu.options': 'Options...',
        'menu.exit': 'Exit',
        'menu.database': 'Database',
        'menu.actors': 'Actors',
        'menu.classes': 'Classes',
        'menu.skills': 'Skills',
        'menu.items': 'Items',
        'menu.weapons': 'Weapons',
        'menu.armors': 'Armors',
        'menu.enemies': 'Enemies',
        'menu.troops': 'Troops',
        'menu.states': 'States',
        'menu.animations': 'Animations',
        'menu.tilesets': 'Tilesets',
        'menu.commonEvents': 'Common Events',
        'menu.system': 'System',
        'menu.types': 'Types',
        'menu.terms': 'Terms',
        'menu.plugins': 'Plugins',
        'menu.managePlugins': 'Manage Plugins',
        'menu.tools': 'Tools',
        'menu.eventManager': 'Event Manager',
        'menu.audioPlayer': '♪ Audio Player',
        'menu.forge': 'Forge',
        'menu.forgeLauncher': 'Forge Launcher',
        'menu.characterGenerator': 'Character Generator',
        'menu.animationGenerator': 'Animation Generator',
        'menu.soundEffectGenerator': 'Sound Effect Generator',
        'menu.build': 'Build',
        'menu.deployGame': 'Deploy Game...',
        'menu.deployEditor': 'Deploy Editor...',
        'menu.help': 'Help',
        'menu.developerTools': 'Developer Tools',
        'menu.about': 'About RPG Reactor',

        'toolbar.tileset': 'Tileset:',
        'toolbar.layer': 'Layer:',
        'toolbar.tools': 'Tools:',
        'toolbar.forge': 'Forge:',
        'toolbar.title.newProject': 'New Project',
        'toolbar.title.openProject': 'Open Project',
        'toolbar.title.saveProject': 'Save Project',
        'toolbar.title.undo': 'Undo (Ctrl+Z)',
        'toolbar.title.redo': 'Redo (Ctrl+Y)',
        'toolbar.title.playtest': 'Playtest',
        'toolbar.title.singleTile': 'Single Tile Tool',
        'toolbar.title.rectangle': 'Rectangular Area Tool',
        'toolbar.title.circle': 'Circular Area Tool',
        'toolbar.title.fill': 'Fill Tool',
        'toolbar.title.shadowPen': 'Shadow Pen (Toggle shadows on tiles)',
        'toolbar.title.eraser': 'Erase Tiles (Layer-Aware)',
        'toolbar.title.autoLayer': 'Auto-Select Layer (Smart Stacking)',
        'toolbar.title.layer1': 'Layer 1',
        'toolbar.title.layer2': 'Layer 2',
        'toolbar.title.layer3': 'Layer 3',
        'toolbar.title.layer4': 'Layer 4',
        'toolbar.title.eventManager': 'Event Manager',
        'toolbar.title.database': 'Database',
        'toolbar.title.plugins': 'Plugins',
        'toolbar.title.audioPlayer': 'Audio Player',
        'toolbar.title.forgeLauncher': 'Forge - Development Tool Suite',

        'welcome.tagline': 'Create amazing RPG games with an open-source, cross-platform engine',
        'welcome.gettingStarted': 'Getting Started',
        'welcome.step.create': 'Create a new project to start building your RPG',
        'welcome.step.design': 'Design maps, events, and game mechanics',
        'welcome.step.test': 'Test your game instantly with the built-in playtest feature',
        'welcome.step.export': 'Export your game for Windows, Mac, and Linux',
        'sidebar.tilesetPalette': 'Tileset Palette',
        'sidebar.events': 'Events',
        'sidebar.noEvents': 'No events on this map',
        'sidebar.maps': 'Maps',
        'sidebar.mapTree': 'Map Tree',
        'sidebar.quickAccess': 'Quick Access',
        'sidebar.noMaps': 'No maps yet',
        'sidebar.noQuickAccessMaps': 'No quick access maps yet',
        'workspace.map': 'Map',
        'workspace.noMapLoaded': 'No Map Loaded',
        'workspace.zoom': 'Zoom:',

        'modal.eventEditor': 'Event Editor',
        'modal.audioPlayer': '♪ Audio Player',
        'audio.bgm': 'BGM (Music)',
        'audio.bgs': 'BGS (Ambient)',
        'audio.me': 'ME (Jingles)',
        'audio.se': 'SE (Effects)',
        'audio.noTrackSelected': 'No track selected',
        'audio.play': 'Play',
        'audio.pause': 'Pause',
        'audio.stop': 'Stop',
        'audio.loopOff': 'Loop: Off',
        'audio.loopOn': 'Loop: On',
        'audio.volume': 'Volume',
        'audio.pitch': 'Pitch',
        'audio.pan': 'Pan',
        'audio.center': 'Center',
        'audio.loadProjectFirst': 'Please load a project first',
        'common.done': 'Done',
        'common.ok': 'OK',
        'common.cancel': 'Cancel',
        'common.apply': 'Apply',
        'common.new': 'New',
        'common.delete': 'Delete',
        'common.copy': 'Copy',
        'common.cut': 'Cut',
        'common.paste': 'Paste',
        'common.duplicate': 'Duplicate',
        'common.unnamed': 'Unnamed',

        'options.title': 'Options',
        'options.appearance': 'Appearance',
        'options.language': 'Language',
        'options.palette': 'Palette',
        'options.mode': 'Mode',
        'options.dark': 'Dark',
        'options.light': 'Light',
        'options.themeNote': 'Theme applies immediately. Re-open any open editor tabs to refresh canvas-drawn elements.',
        'options.languageNote': 'Language applies immediately to localized editor interface text. Some deep editor forms will be localized incrementally.',

        'about.title': 'About RPG Reactor',
        'about.version': 'RPG Reactor v0.91',
        'about.description': 'An open-source, cross-platform RPG game engine built with NW.js and PixiJS v8',
        'about.compatibility': 'Create amazing RPG games with a professional editor that runs on Windows, Mac, and Linux. Compatible with RPG Maker MZ and MV projects in most cases; runtime compatibility depends primarily on the project\'s corescripts and plugins.',
        'about.linksTitle': 'Psychronic Links',
        'about.itch': 'Itch.io - Plugins And Tools',
        'about.steam': 'Steam - Psychronic Games',
        'about.github': 'GitHub - Other Projects',
        'about.youtube': 'YouTube - Psychronic Games',
        'about.discord': 'Discord - Join The Community',
        'about.license': 'License: MIT',

        'theme.gold.name': 'Default',
        'theme.gold.description': 'Classic gold-on-black premium editor',
        'theme.bubblegum.name': 'Bubblegum',
        'theme.bubblegum.description': 'Cute hot-pink palette',
        'theme.ocean.name': 'Ocean',
        'theme.ocean.description': 'Cool sky-blue palette',
        'theme.cascadia.name': 'Cascadia',
        'theme.cascadia.description': 'Pacific NW evergreen forest green palette',
        'theme.underworld.name': 'Underworld',
        'theme.underworld.description': 'Blood-red crimson palette',
        'theme.creamsicle.name': 'Orange Creamsicle',
        'theme.creamsicle.description': 'Tangerine orange on warm cream',
        'theme.royalty.name': 'Royalty',
        'theme.royalty.description': 'Royal purple primary with gold trim',

        'forge.characterGenerator.description': 'Build character sprite sheets from layered parts.',
        'forge.animationGenerator.description': 'Bake procedural animation sprite sheets (geometric, particle, etc.).',
        'forge.soundEffectGenerator.description': 'Procedural SFX synth - sfxr-style archetypes + Web Audio.',
        'forge.tools': 'Tools',
        'forge.welcome': 'Asset-generation tool suite. Pick a tool from the sidebar or below.',
        'forge.openProject': 'Open a project to use Forge tools.',
        'forge.tab.procedural': 'Procedural',
        'forge.tab.outfit': 'Outfit Forge',
        'forge.tab.parts': 'Parts (PNG)',
        'forge.style': 'Style:',
        'forge.frame': 'Frame:',
        'forge.sheet': 'Sheet:',
        'forge.saveAs': 'Save as:',
        'forge.saveSheet': 'Save Sheet',
        'forge.generateSave': 'Generate & Save to Library',

        'db.system1': 'System 1',
        'db.system2': 'System 2',
        'db.search': 'Search {title}...',
        'db.selectEntry': 'Select an entry from the list',
        'db.changeMaximum': 'Change Maximum',
        'db.selectEntryToDelete': 'Select an entry to delete',
        'db.deleteConfirm': 'Delete "{name}"?',
        'db.unknownType': 'Unknown database type: {type}',
        'db.saved': 'Database saved',
        'db.maximumChanged': '{title} maximum changed to {max}',
        'db.entryCleared': 'Entry cleared',
        'db.entryCopied': 'Entry copied to clipboard',
        'db.entryCut': 'Entry cut to clipboard',
        'db.entryPasted': 'Entry pasted',
        'db.entryDuplicated': 'Entry duplicated',

        'event.name': 'Event Name:',
        'event.position': 'Position:',
        'event.note': 'Note:',
        'event.newPage': 'New Event Page',
        'event.copyPage': 'Copy Event Page',
        'event.pastePage': 'Paste Event Page',
        'event.deletePage': 'Delete Event Page',
        'event.clearPage': 'Clear Event Page',
        'event.page': 'Page {number}',
        'event.contents': 'Contents',
        'event.commandsTotal': 'Event Commands ({count} total)',
        'event.noCommands': 'No commands. Right-click to add commands.',
        'event.noCommandsDefined': 'No commands defined yet.',
        'event.commandListPlaceholder': 'Event commands list ({count} commands)',
        'event.commandEditorPlaceholder': 'Command editor interface will be implemented here.',
        'event.selectCommand': 'Select Event Command',
        'event.noPageClipboard': 'No page in clipboard to paste.',
        'event.cannotDeleteLastPage': 'Cannot delete the last page. An event must have at least one page.',
        'event.deletePageConfirm': 'Are you sure you want to delete this page?',
        'event.clearPageConfirm': 'Are you sure you want to clear this page? All settings will be reset.',
        'event.conditions': 'Conditions',
        'event.switch1': 'Switch 1:',
        'event.switch2': 'Switch 2:',
        'event.variable': 'Variable >=:',
        'event.selfSwitch': 'Self Switch:',
        'event.item': 'Item:',
        'event.actor': 'Actor:',
        'event.image': 'Image',
        'event.browse': 'Browse...',
        'event.none': 'None',
        'event.index': 'Index:',
        'event.dir': 'Dir:',
        'event.pattern': 'Pattern:',
        'event.tile': 'Tile:',
        'event.options': 'Options',
        'event.walkingAnimation': 'Walking Animation',
        'event.steppingAnimation': 'Stepping Animation',
        'event.directionFix': 'Direction Fix',
        'event.through': 'Through',
        'event.autonomousMovement': 'Autonomous Movement',
        'event.type': 'Type:',
        'event.speed': 'Speed:',
        'event.frequency': 'Frequency:',
        'event.priority': 'Priority',
        'event.trigger': 'Trigger',
        'event.fixed': 'Fixed',
        'event.random': 'Random',
        'event.approach': 'Approach',
        'event.custom': 'Custom',
        'event.normal': 'Normal',
        'event.lowest': 'Lowest',
        'event.lower': 'Lower',
        'event.higher': 'Higher',
        'event.highest': 'Highest',
        'event.belowCharacters': 'Below Characters',
        'event.sameAsCharacters': 'Same as Characters',
        'event.aboveCharacters': 'Above Characters',
        'event.actionButton': 'Action Button',
        'event.playerTouch': 'Player Touch',
        'event.eventTouch': 'Event Touch',
        'event.autorun': 'Autorun',
        'event.parallel': 'Parallel',
        'event.noneAvailable': 'None available',

        'status.noProjectLoaded': 'No project loaded',
        'status.playtestNotImplemented': 'Playtest mode not yet implemented',
        'status.loadMapFirst': 'Load a map first',
        'status.eventModeEnabled': 'Event mode enabled',
        'status.eventModeDisabled': 'Event mode disabled',
        'alert.loadProjectFirst': 'Please load a project first.'
    },
    ja: {
        'app.loading': '読み込み中...',
        'menu.file': 'ファイル',
        'menu.newProject': '新規プロジェクト',
        'menu.openProject': 'プロジェクトを開く',
        'menu.closeProject': 'プロジェクトを閉じる',
        'menu.options': 'オプション...',
        'menu.exit': '終了',
        'menu.database': 'データベース',
        'menu.actors': 'アクター',
        'menu.classes': '職業',
        'menu.skills': 'スキル',
        'menu.items': 'アイテム',
        'menu.weapons': '武器',
        'menu.armors': '防具',
        'menu.enemies': '敵キャラ',
        'menu.troops': '敵グループ',
        'menu.states': 'ステート',
        'menu.animations': 'アニメーション',
        'menu.tilesets': 'タイルセット',
        'menu.commonEvents': 'コモンイベント',
        'menu.system': 'システム',
        'menu.types': 'タイプ',
        'menu.terms': '用語',
        'menu.plugins': 'プラグイン',
        'menu.managePlugins': 'プラグイン管理',
        'menu.tools': 'ツール',
        'menu.eventManager': 'イベントマネージャー',
        'menu.audioPlayer': '♪ オーディオプレイヤー',
        'menu.forge': 'フォージ',
        'menu.forgeLauncher': 'フォージ ランチャー',
        'menu.characterGenerator': 'キャラクタージェネレーター',
        'menu.animationGenerator': 'アニメーションジェネレーター',
        'menu.soundEffectGenerator': '効果音ジェネレーター',
        'menu.build': 'ビルド',
        'menu.deployGame': 'ゲームを書き出し...',
        'menu.deployEditor': 'エディターを書き出し...',
        'menu.help': 'ヘルプ',
        'menu.developerTools': '開発者ツール',
        'menu.about': 'RPG Reactor について',

        'toolbar.tileset': 'タイルセット:',
        'toolbar.layer': 'レイヤー:',
        'toolbar.tools': 'ツール:',
        'toolbar.forge': 'フォージ:',
        'toolbar.title.newProject': '新規プロジェクト',
        'toolbar.title.openProject': 'プロジェクトを開く',
        'toolbar.title.saveProject': 'プロジェクトを保存',
        'toolbar.title.undo': '元に戻す (Ctrl+Z)',
        'toolbar.title.redo': 'やり直し (Ctrl+Y)',
        'toolbar.title.playtest': 'プレイテスト',
        'toolbar.title.singleTile': '単一タイルツール',
        'toolbar.title.rectangle': '矩形範囲ツール',
        'toolbar.title.circle': '円形範囲ツール',
        'toolbar.title.fill': '塗りつぶしツール',
        'toolbar.title.shadowPen': '影ペン (タイルの影を切り替え)',
        'toolbar.title.eraser': 'タイル消去 (レイヤー対応)',
        'toolbar.title.autoLayer': '自動レイヤー選択 (スマート重ね合わせ)',
        'toolbar.title.layer1': 'レイヤー 1',
        'toolbar.title.layer2': 'レイヤー 2',
        'toolbar.title.layer3': 'レイヤー 3',
        'toolbar.title.layer4': 'レイヤー 4',
        'toolbar.title.eventManager': 'イベントマネージャー',
        'toolbar.title.database': 'データベース',
        'toolbar.title.plugins': 'プラグイン',
        'toolbar.title.audioPlayer': 'オーディオプレイヤー',
        'toolbar.title.forgeLauncher': 'フォージ - 開発ツールスイート',

        'welcome.tagline': 'オープンソースのクロスプラットフォームエンジンで、すばらしいRPGを作成',
        'welcome.gettingStarted': 'はじめに',
        'welcome.step.create': '新規プロジェクトを作成してRPG制作を開始',
        'welcome.step.design': 'マップ、イベント、ゲームシステムを設計',
        'welcome.step.test': '内蔵プレイテストですぐに動作確認',
        'welcome.step.export': 'Windows、Mac、Linux 向けにゲームを書き出し',
        'sidebar.tilesetPalette': 'タイルセットパレット',
        'sidebar.events': 'イベント',
        'sidebar.noEvents': 'このマップにイベントはありません',
        'sidebar.maps': 'マップ',
        'sidebar.mapTree': 'マップツリー',
        'sidebar.quickAccess': 'クイックアクセス',
        'sidebar.noMaps': 'マップはまだありません',
        'sidebar.noQuickAccessMaps': 'クイックアクセスのマップはまだありません',
        'workspace.map': 'マップ',
        'workspace.noMapLoaded': 'マップ未読み込み',
        'workspace.zoom': 'ズーム:',

        'modal.eventEditor': 'イベントエディター',
        'modal.audioPlayer': '♪ オーディオプレイヤー',
        'audio.bgm': 'BGM (音楽)',
        'audio.bgs': 'BGS (環境音)',
        'audio.me': 'ME (ジングル)',
        'audio.se': 'SE (効果音)',
        'audio.noTrackSelected': 'トラックが選択されていません',
        'audio.play': '再生',
        'audio.pause': '一時停止',
        'audio.stop': '停止',
        'audio.loopOff': 'ループ: オフ',
        'audio.loopOn': 'ループ: オン',
        'audio.volume': '音量',
        'audio.pitch': 'ピッチ',
        'audio.pan': 'パン',
        'audio.center': '中央',
        'audio.loadProjectFirst': '先にプロジェクトを読み込んでください',
        'common.done': '完了',
        'common.ok': 'OK',
        'common.cancel': 'キャンセル',
        'common.apply': '適用',
        'common.new': '新規',
        'common.delete': '削除',
        'common.copy': 'コピー',
        'common.cut': '切り取り',
        'common.paste': '貼り付け',
        'common.duplicate': '複製',
        'common.unnamed': '名前なし',

        'options.title': 'オプション',
        'options.appearance': '表示',
        'options.language': '言語',
        'options.palette': 'パレット',
        'options.mode': 'モード',
        'options.dark': 'ダーク',
        'options.light': 'ライト',
        'options.themeNote': 'テーマはすぐに適用されます。キャンバス描画要素を更新するには、開いているエディタータブを開き直してください。',
        'options.languageNote': '言語は対応済みのエディターUIテキストにすぐ適用されます。一部の詳細フォームは順次ローカライズします。',

        'about.title': 'RPG Reactor について',
        'about.version': 'RPG Reactor v0.91',
        'about.description': 'NW.js と PixiJS v8 で構築された、オープンソースのクロスプラットフォームRPGゲームエンジンです',
        'about.compatibility': 'Windows、Mac、Linux で動作する本格的なエディターで、すばらしいRPGを作成できます。多くの場合、RPG Maker MZ / MV プロジェクトと互換性がありますが、ランタイム互換性は主にプロジェクトのコアスクリプトとプラグインに依存します。',
        'about.linksTitle': 'Psychronic リンク',
        'about.itch': 'Itch.io - プラグインとツール',
        'about.steam': 'Steam - Psychronic のゲーム',
        'about.github': 'GitHub - その他のプロジェクト',
        'about.youtube': 'YouTube - Psychronic Games',
        'about.discord': 'Discord - コミュニティに参加',
        'about.license': 'ライセンス: MIT',

        'theme.gold.name': 'デフォルト',
        'theme.gold.description': 'クラシックな黒地にゴールドのプレミアムエディター',
        'theme.bubblegum.name': 'バブルガム',
        'theme.bubblegum.description': 'かわいいホットピンクのパレット',
        'theme.ocean.name': 'オーシャン',
        'theme.ocean.description': '涼しげなスカイブルーのパレット',
        'theme.cascadia.name': 'カスケーディア',
        'theme.cascadia.description': '太平洋岸北西部風の常緑フォレストグリーン',
        'theme.underworld.name': 'アンダーワールド',
        'theme.underworld.description': '血のような深紅のパレット',
        'theme.creamsicle.name': 'オレンジクリームシクル',
        'theme.creamsicle.description': '温かいクリーム色にタンジェリンオレンジ',
        'theme.royalty.name': 'ロイヤルティ',
        'theme.royalty.description': '王室の紫を基調にゴールドの縁取り',

        'forge.characterGenerator.description': 'レイヤー化されたパーツからキャラクタースプライトシートを作成します。',
        'forge.animationGenerator.description': '手続き型アニメーションのスプライトシートを焼き出します。',
        'forge.soundEffectGenerator.description': 'sfxr風の原型とWeb Audioによる手続き型効果音シンセです。',
        'forge.tools': 'ツール',
        'forge.welcome': 'アセット生成ツールスイートです。サイドバーまたは下の項目からツールを選んでください。',
        'forge.openProject': 'フォージツールを使うにはプロジェクトを開いてください。',
        'forge.tab.procedural': '手続き型',
        'forge.tab.outfit': 'Outfit Forge',
        'forge.tab.parts': 'パーツ (PNG)',
        'forge.style': 'スタイル:',
        'forge.frame': 'フレーム:',
        'forge.sheet': 'シート:',
        'forge.saveAs': '保存名:',
        'forge.saveSheet': 'シートを保存',
        'forge.generateSave': '生成してライブラリに保存',

        'db.system1': 'システム 1',
        'db.system2': 'システム 2',
        'db.search': '{title}を検索...',
        'db.selectEntry': 'リストから項目を選択してください',
        'db.changeMaximum': '最大数を変更',
        'db.selectEntryToDelete': '削除する項目を選択してください',
        'db.deleteConfirm': '「{name}」を削除しますか？',
        'db.unknownType': '不明なデータベースタイプ: {type}',
        'db.saved': 'データベースを保存しました',
        'db.maximumChanged': '{title} の最大数を {max} に変更しました',
        'db.entryCleared': '項目をクリアしました',
        'db.entryCopied': '項目をクリップボードにコピーしました',
        'db.entryCut': '項目をクリップボードに切り取りました',
        'db.entryPasted': '項目を貼り付けました',
        'db.entryDuplicated': '項目を複製しました',

        'event.name': 'イベント名:',
        'event.position': '位置:',
        'event.note': 'メモ:',
        'event.newPage': '新規イベントページ',
        'event.copyPage': 'イベントページをコピー',
        'event.pastePage': 'イベントページを貼り付け',
        'event.deletePage': 'イベントページを削除',
        'event.clearPage': 'イベントページをクリア',
        'event.page': 'ページ {number}',
        'event.contents': '内容',
        'event.commandsTotal': 'イベントコマンド ({count} 件)',
        'event.noCommands': 'コマンドがありません。右クリックで追加できます。',
        'event.noCommandsDefined': 'コマンドはまだ定義されていません。',
        'event.commandListPlaceholder': 'イベントコマンド一覧 ({count} 件)',
        'event.commandEditorPlaceholder': 'コマンド編集インターフェイスはここに実装されます。',
        'event.selectCommand': 'イベントコマンドを選択',
        'event.noPageClipboard': '貼り付けるページがクリップボードにありません。',
        'event.cannotDeleteLastPage': '最後のページは削除できません。イベントには少なくとも1ページが必要です。',
        'event.deletePageConfirm': 'このページを削除してもよろしいですか？',
        'event.clearPageConfirm': 'このページをクリアしますか？すべての設定がリセットされます。',
        'event.conditions': '条件',
        'event.switch1': 'スイッチ 1:',
        'event.switch2': 'スイッチ 2:',
        'event.variable': '変数 >=:',
        'event.selfSwitch': 'セルフスイッチ:',
        'event.item': 'アイテム:',
        'event.actor': 'アクター:',
        'event.image': '画像',
        'event.browse': '参照...',
        'event.none': 'なし',
        'event.index': 'インデックス:',
        'event.dir': '向き:',
        'event.pattern': 'パターン:',
        'event.tile': 'タイル:',
        'event.options': 'オプション',
        'event.walkingAnimation': '歩行アニメ',
        'event.steppingAnimation': '足踏みアニメ',
        'event.directionFix': '向き固定',
        'event.through': 'すり抜け',
        'event.autonomousMovement': '自律移動',
        'event.type': 'タイプ:',
        'event.speed': '速度:',
        'event.frequency': '頻度:',
        'event.priority': 'プライオリティ',
        'event.trigger': 'トリガー',
        'event.fixed': '固定',
        'event.random': 'ランダム',
        'event.approach': '近づく',
        'event.custom': 'カスタム',
        'event.normal': '通常',
        'event.lowest': '最低',
        'event.lower': '低い',
        'event.higher': '高い',
        'event.highest': '最高',
        'event.belowCharacters': '通常キャラの下',
        'event.sameAsCharacters': '通常キャラと同じ',
        'event.aboveCharacters': '通常キャラの上',
        'event.actionButton': '決定ボタン',
        'event.playerTouch': 'プレイヤーから接触',
        'event.eventTouch': 'イベントから接触',
        'event.autorun': '自動実行',
        'event.parallel': '並列処理',
        'event.noneAvailable': '利用可能な項目がありません',

        'status.noProjectLoaded': 'プロジェクトが読み込まれていません',
        'status.playtestNotImplemented': 'プレイテストモードはまだ実装されていません',
        'status.loadMapFirst': '先にマップを読み込んでください',
        'status.eventModeEnabled': 'イベントモードを有効にしました',
        'status.eventModeDisabled': 'イベントモードを無効にしました',
        'alert.loadProjectFirst': '先にプロジェクトを読み込んでください。'
    },
    es: {
        'app.loading': 'Cargando...',
        'menu.file': 'Archivo',
        'menu.newProject': 'Nuevo proyecto',
        'menu.openProject': 'Abrir proyecto',
        'menu.closeProject': 'Cerrar proyecto',
        'menu.options': 'Opciones...',
        'menu.exit': 'Salir',
        'menu.database': 'Base de datos',
        'menu.actors': 'Actores',
        'menu.classes': 'Clases',
        'menu.skills': 'Habilidades',
        'menu.items': 'Objetos',
        'menu.weapons': 'Armas',
        'menu.armors': 'Armaduras',
        'menu.enemies': 'Enemigos',
        'menu.troops': 'Grupos enemigos',
        'menu.states': 'Estados',
        'menu.animations': 'Animaciones',
        'menu.tilesets': 'Tilesets',
        'menu.commonEvents': 'Eventos comunes',
        'menu.system': 'Sistema',
        'menu.types': 'Tipos',
        'menu.terms': 'Términos',
        'menu.plugins': 'Plugins',
        'menu.managePlugins': 'Administrar plugins',
        'menu.tools': 'Herramientas',
        'menu.eventManager': 'Administrador de eventos',
        'menu.audioPlayer': '♪ Reproductor de audio',
        'menu.forge': 'Forja',
        'menu.forgeLauncher': 'Lanzador de Forja',
        'menu.characterGenerator': 'Generador de personajes',
        'menu.animationGenerator': 'Generador de animaciones',
        'menu.soundEffectGenerator': 'Generador de efectos de sonido',
        'menu.build': 'Compilar',
        'menu.deployGame': 'Exportar juego...',
        'menu.deployEditor': 'Exportar editor...',
        'menu.help': 'Ayuda',
        'menu.developerTools': 'Herramientas de desarrollo',
        'menu.about': 'Acerca de RPG Reactor',

        'toolbar.tileset': 'Tileset:',
        'toolbar.layer': 'Capa:',
        'toolbar.tools': 'Herramientas:',
        'toolbar.forge': 'Forja:',
        'toolbar.title.newProject': 'Nuevo proyecto',
        'toolbar.title.openProject': 'Abrir proyecto',
        'toolbar.title.saveProject': 'Guardar proyecto',
        'toolbar.title.undo': 'Deshacer (Ctrl+Z)',
        'toolbar.title.redo': 'Rehacer (Ctrl+Y)',
        'toolbar.title.playtest': 'Probar juego',
        'toolbar.title.singleTile': 'Herramienta de tile único',
        'toolbar.title.rectangle': 'Herramienta de área rectangular',
        'toolbar.title.circle': 'Herramienta de área circular',
        'toolbar.title.fill': 'Herramienta de relleno',
        'toolbar.title.shadowPen': 'Lápiz de sombras (alternar sombras en tiles)',
        'toolbar.title.eraser': 'Borrar tiles (según capa)',
        'toolbar.title.autoLayer': 'Seleccionar capa automáticamente (apilado inteligente)',
        'toolbar.title.layer1': 'Capa 1',
        'toolbar.title.layer2': 'Capa 2',
        'toolbar.title.layer3': 'Capa 3',
        'toolbar.title.layer4': 'Capa 4',
        'toolbar.title.eventManager': 'Administrador de eventos',
        'toolbar.title.database': 'Base de datos',
        'toolbar.title.plugins': 'Plugins',
        'toolbar.title.audioPlayer': 'Reproductor de audio',
        'toolbar.title.forgeLauncher': 'Forja - Conjunto de herramientas de desarrollo',

        'welcome.tagline': 'Crea juegos RPG increíbles con un motor de código abierto y multiplataforma',
        'welcome.gettingStarted': 'Primeros pasos',
        'welcome.step.create': 'Crea un proyecto nuevo para empezar tu RPG',
        'welcome.step.design': 'Diseña mapas, eventos y mecánicas de juego',
        'welcome.step.test': 'Prueba tu juego al instante con la función de prueba integrada',
        'welcome.step.export': 'Exporta tu juego para Windows, Mac y Linux',
        'sidebar.tilesetPalette': 'Paleta de tilesets',
        'sidebar.events': 'Eventos',
        'sidebar.noEvents': 'No hay eventos en este mapa',
        'sidebar.maps': 'Mapas',
        'sidebar.mapTree': 'Árbol de mapas',
        'sidebar.quickAccess': 'Acceso rápido',
        'sidebar.noMaps': 'Aún no hay mapas',
        'sidebar.noQuickAccessMaps': 'Aún no hay mapas de acceso rápido',
        'workspace.map': 'Mapa',
        'workspace.noMapLoaded': 'No hay mapa cargado',
        'workspace.zoom': 'Zoom:',

        'modal.eventEditor': 'Editor de eventos',
        'modal.audioPlayer': '♪ Reproductor de audio',
        'audio.bgm': 'BGM (Música)',
        'audio.bgs': 'BGS (Ambiente)',
        'audio.me': 'ME (Cortinillas)',
        'audio.se': 'SE (Efectos)',
        'audio.noTrackSelected': 'Ninguna pista seleccionada',
        'audio.play': 'Reproducir',
        'audio.pause': 'Pausar',
        'audio.stop': 'Detener',
        'audio.loopOff': 'Bucle: desactivado',
        'audio.loopOn': 'Bucle: activado',
        'audio.volume': 'Volumen',
        'audio.pitch': 'Tono',
        'audio.pan': 'Paneo',
        'audio.center': 'Centro',
        'audio.loadProjectFirst': 'Carga un proyecto primero',
        'common.done': 'Listo',
        'common.ok': 'OK',
        'common.cancel': 'Cancelar',
        'common.apply': 'Aplicar',
        'common.new': 'Nuevo',
        'common.delete': 'Eliminar',
        'common.copy': 'Copiar',
        'common.cut': 'Cortar',
        'common.paste': 'Pegar',
        'common.duplicate': 'Duplicar',
        'common.unnamed': 'Sin nombre',

        'options.title': 'Opciones',
        'options.appearance': 'Apariencia',
        'options.language': 'Idioma',
        'options.palette': 'Paleta',
        'options.mode': 'Modo',
        'options.dark': 'Oscuro',
        'options.light': 'Claro',
        'options.themeNote': 'El tema se aplica de inmediato. Vuelve a abrir las pestañas del editor para refrescar los elementos dibujados en canvas.',
        'options.languageNote': 'El idioma se aplica de inmediato al texto localizado de la interfaz. Algunos formularios avanzados se localizarán gradualmente.',

        'about.title': 'Acerca de RPG Reactor',
        'about.version': 'RPG Reactor v0.91',
        'about.description': 'Un motor de juegos RPG de código abierto y multiplataforma creado con NW.js y PixiJS v8',
        'about.compatibility': 'Crea juegos RPG increíbles con un editor profesional que funciona en Windows, Mac y Linux. Es compatible con proyectos de RPG Maker MZ y MV en la mayoría de los casos; la compatibilidad en tiempo de ejecución depende principalmente de los corescripts y plugins del proyecto.',
        'about.linksTitle': 'Enlaces de Psychronic',
        'about.itch': 'Itch.io - Plugins Y Herramientas',
        'about.steam': 'Steam - Juegos De Psychronic',
        'about.github': 'GitHub - Otros Proyectos',
        'about.youtube': 'YouTube - Psychronic Games',
        'about.discord': 'Discord - Únete A La Comunidad',
        'about.license': 'Licencia: MIT',

        'theme.gold.name': 'Predeterminado',
        'theme.gold.description': 'Editor premium clásico de dorado sobre negro',
        'theme.bubblegum.name': 'Bubblegum',
        'theme.bubblegum.description': 'Paleta rosa intenso y divertida',
        'theme.ocean.name': 'Océano',
        'theme.ocean.description': 'Paleta azul cielo y fresca',
        'theme.cascadia.name': 'Cascadia',
        'theme.cascadia.description': 'Verde bosque del noroeste del Pacífico',
        'theme.underworld.name': 'Inframundo',
        'theme.underworld.description': 'Paleta carmesí rojo sangre',
        'theme.creamsicle.name': 'Creamsicle naranja',
        'theme.creamsicle.description': 'Naranja mandarina sobre crema cálida',
        'theme.royalty.name': 'Realeza',
        'theme.royalty.description': 'Morado real principal con ribete dorado',

        'forge.characterGenerator.description': 'Crea hojas de sprites de personajes a partir de partes en capas.',
        'forge.animationGenerator.description': 'Genera hojas de sprites de animación procedimental.',
        'forge.soundEffectGenerator.description': 'Sintetizador procedural de SFX estilo sfxr con Web Audio.',
        'forge.tools': 'Herramientas',
        'forge.welcome': 'Conjunto de herramientas de generación de recursos. Elige una herramienta desde la barra lateral o abajo.',
        'forge.openProject': 'Abre un proyecto para usar las herramientas de Forja.',
        'forge.tab.procedural': 'Procedural',
        'forge.tab.outfit': 'Outfit Forge',
        'forge.tab.parts': 'Partes (PNG)',
        'forge.style': 'Estilo:',
        'forge.frame': 'Fotograma:',
        'forge.sheet': 'Hoja:',
        'forge.saveAs': 'Guardar como:',
        'forge.saveSheet': 'Guardar hoja',
        'forge.generateSave': 'Generar y guardar en biblioteca',

        'db.system1': 'Sistema 1',
        'db.system2': 'Sistema 2',
        'db.search': 'Buscar {title}...',
        'db.selectEntry': 'Selecciona una entrada de la lista',
        'db.changeMaximum': 'Cambiar máximo',
        'db.selectEntryToDelete': 'Selecciona una entrada para eliminar',
        'db.deleteConfirm': '¿Eliminar "{name}"?',
        'db.unknownType': 'Tipo de base de datos desconocido: {type}',
        'db.saved': 'Base de datos guardada',
        'db.maximumChanged': 'Máximo de {title} cambiado a {max}',
        'db.entryCleared': 'Entrada limpiada',
        'db.entryCopied': 'Entrada copiada al portapapeles',
        'db.entryCut': 'Entrada cortada al portapapeles',
        'db.entryPasted': 'Entrada pegada',
        'db.entryDuplicated': 'Entrada duplicada',

        'event.name': 'Nombre del evento:',
        'event.position': 'Posición:',
        'event.note': 'Nota:',
        'event.newPage': 'Nueva página de evento',
        'event.copyPage': 'Copiar página de evento',
        'event.pastePage': 'Pegar página de evento',
        'event.deletePage': 'Eliminar página de evento',
        'event.clearPage': 'Limpiar página de evento',
        'event.page': 'Página {number}',
        'event.contents': 'Contenido',
        'event.commandsTotal': 'Comandos de evento ({count} total)',
        'event.noCommands': 'No hay comandos. Haz clic derecho para agregar comandos.',
        'event.noCommandsDefined': 'Aún no hay comandos definidos.',
        'event.commandListPlaceholder': 'Lista de comandos de evento ({count} comandos)',
        'event.commandEditorPlaceholder': 'La interfaz de edición de comandos se implementará aquí.',
        'event.selectCommand': 'Seleccionar comando de evento',
        'event.noPageClipboard': 'No hay ninguna página en el portapapeles para pegar.',
        'event.cannotDeleteLastPage': 'No se puede eliminar la última página. Un evento debe tener al menos una página.',
        'event.deletePageConfirm': '¿Seguro que quieres eliminar esta página?',
        'event.clearPageConfirm': '¿Seguro que quieres limpiar esta página? Todos los ajustes se restablecerán.',
        'event.conditions': 'Condiciones',
        'event.switch1': 'Interruptor 1:',
        'event.switch2': 'Interruptor 2:',
        'event.variable': 'Variable >=:',
        'event.selfSwitch': 'Interruptor local:',
        'event.item': 'Objeto:',
        'event.actor': 'Actor:',
        'event.image': 'Imagen',
        'event.browse': 'Examinar...',
        'event.none': 'Ninguno',
        'event.index': 'Índice:',
        'event.dir': 'Dir:',
        'event.pattern': 'Patrón:',
        'event.tile': 'Tile:',
        'event.options': 'Opciones',
        'event.walkingAnimation': 'Animación al caminar',
        'event.steppingAnimation': 'Animación de pasos',
        'event.directionFix': 'Dirección fija',
        'event.through': 'Atravesar',
        'event.autonomousMovement': 'Movimiento autónomo',
        'event.type': 'Tipo:',
        'event.speed': 'Velocidad:',
        'event.frequency': 'Frecuencia:',
        'event.priority': 'Prioridad',
        'event.trigger': 'Activador',
        'event.fixed': 'Fijo',
        'event.random': 'Aleatorio',
        'event.approach': 'Acercarse',
        'event.custom': 'Personalizado',
        'event.normal': 'Normal',
        'event.lowest': 'Mínima',
        'event.lower': 'Baja',
        'event.higher': 'Alta',
        'event.highest': 'Máxima',
        'event.belowCharacters': 'Debajo de personajes',
        'event.sameAsCharacters': 'Igual que personajes',
        'event.aboveCharacters': 'Encima de personajes',
        'event.actionButton': 'Botón de acción',
        'event.playerTouch': 'Toque del jugador',
        'event.eventTouch': 'Toque del evento',
        'event.autorun': 'Ejecución automática',
        'event.parallel': 'Paralelo',
        'event.noneAvailable': 'No hay elementos disponibles',

        'status.noProjectLoaded': 'No hay proyecto cargado',
        'status.playtestNotImplemented': 'El modo de prueba aún no está implementado',
        'status.loadMapFirst': 'Carga un mapa primero',
        'status.eventModeEnabled': 'Modo de eventos activado',
        'status.eventModeDisabled': 'Modo de eventos desactivado',
        'alert.loadProjectFirst': 'Carga un proyecto primero.'
    }
};

const RR_ADDITIONAL_LOCALES = {
    'zh-Hant': {
        'app.loading': '載入中...',
        'menu.file': '檔案', 'menu.newProject': '新增專案', 'menu.openProject': '開啟專案', 'menu.closeProject': '關閉專案', 'menu.options': '選項...', 'menu.exit': '結束',
        'menu.database': '資料庫', 'menu.actors': '角色', 'menu.classes': '職業', 'menu.skills': '技能', 'menu.items': '物品', 'menu.weapons': '武器', 'menu.armors': '防具', 'menu.enemies': '敵人', 'menu.troops': '敵群', 'menu.states': '狀態', 'menu.animations': '動畫', 'menu.tilesets': '圖塊組', 'menu.commonEvents': '共通事件', 'menu.system': '系統', 'menu.types': '類型', 'menu.terms': '用語',
        'menu.plugins': '外掛', 'menu.managePlugins': '管理外掛', 'menu.tools': '工具', 'menu.eventManager': '事件管理器', 'menu.audioPlayer': '♪ 音訊播放器', 'menu.forge': '鍛造坊', 'menu.forgeLauncher': '鍛造坊啟動器', 'menu.characterGenerator': '角色產生器', 'menu.animationGenerator': '動畫產生器', 'menu.soundEffectGenerator': '音效產生器', 'menu.build': '建置', 'menu.deployGame': '匯出遊戲...', 'menu.deployEditor': '匯出編輯器...', 'menu.help': '說明', 'menu.developerTools': '開發者工具', 'menu.about': '關於 RPG Reactor',
        'toolbar.tileset': '圖塊組:', 'toolbar.layer': '圖層:', 'toolbar.tools': '工具:', 'toolbar.forge': '鍛造坊:', 'toolbar.title.newProject': '新增專案', 'toolbar.title.openProject': '開啟專案', 'toolbar.title.saveProject': '儲存專案', 'toolbar.title.undo': '復原 (Ctrl+Z)', 'toolbar.title.redo': '重做 (Ctrl+Y)', 'toolbar.title.playtest': '測試遊玩', 'toolbar.title.eventManager': '事件管理器', 'toolbar.title.database': '資料庫', 'toolbar.title.plugins': '外掛', 'toolbar.title.audioPlayer': '音訊播放器', 'toolbar.title.forgeLauncher': '鍛造坊 - 開發工具組',
        'welcome.tagline': '使用開源、跨平台引擎製作精彩 RPG 遊戲', 'welcome.gettingStarted': '開始使用', 'welcome.step.create': '建立新專案開始製作 RPG', 'welcome.step.design': '設計地圖、事件與遊戲機制', 'welcome.step.test': '使用內建測試遊玩立即試玩', 'welcome.step.export': '匯出到 Windows、Mac 與 Linux',
        'sidebar.tilesetPalette': '圖塊組調色盤', 'sidebar.events': '事件', 'sidebar.noEvents': '此地圖沒有事件', 'sidebar.maps': '地圖', 'sidebar.mapTree': '地圖樹', 'sidebar.quickAccess': '快速存取', 'sidebar.noMaps': '尚無地圖', 'sidebar.noQuickAccessMaps': '尚無快速存取地圖', 'workspace.map': '地圖', 'workspace.noMapLoaded': '未載入地圖', 'workspace.zoom': '縮放:',
        'modal.eventEditor': '事件編輯器', 'modal.audioPlayer': '♪ 音訊播放器', 'audio.bgm': 'BGM (音樂)', 'audio.bgs': 'BGS (環境音)', 'audio.me': 'ME (短樂句)', 'audio.se': 'SE (音效)', 'audio.noTrackSelected': '未選擇音軌', 'audio.play': '播放', 'audio.pause': '暫停', 'audio.stop': '停止', 'audio.loopOff': '循環: 關', 'audio.loopOn': '循環: 開', 'audio.volume': '音量', 'audio.pitch': '音高', 'audio.pan': '聲像', 'audio.center': '中央', 'audio.loadProjectFirst': '請先載入專案',
        'common.done': '完成', 'common.ok': '確定', 'common.cancel': '取消', 'common.apply': '套用', 'common.new': '新增', 'common.delete': '刪除', 'common.copy': '複製', 'common.cut': '剪下', 'common.paste': '貼上', 'common.duplicate': '建立副本', 'common.unnamed': '未命名',
        'options.title': '選項', 'options.appearance': '外觀', 'options.language': '語言', 'options.palette': '配色', 'options.mode': '模式', 'options.dark': '深色', 'options.light': '淺色', 'options.themeNote': '主題會立即套用。請重新開啟已開啟的編輯器分頁以刷新 Canvas 繪製元素。', 'options.languageNote': '語言會立即套用到已本地化的編輯器介面文字。部分深層表單會逐步本地化。',
        'about.title': '關於 RPG Reactor', 'about.description': '使用 NW.js 與 PixiJS v8 打造的開源跨平台 RPG 遊戲引擎', 'about.compatibility': '使用可在 Windows、Mac 與 Linux 上執行的專業編輯器製作精彩 RPG 遊戲。多數情況下相容 RPG Maker MZ 與 MV 專案；執行階段相容性主要取決於專案的核心腳本與外掛。', 'about.linksTitle': 'Psychronic 連結', 'about.itch': 'Itch.io - 外掛與工具', 'about.steam': 'Steam - Psychronic 遊戲', 'about.github': 'GitHub - 其他專案', 'about.youtube': 'YouTube - Psychronic Games', 'about.discord': 'Discord - 加入社群', 'about.license': '授權: MIT',
        'forge.tools': '工具', 'forge.welcome': '資產產生工具組。請從側邊欄或下方選擇工具。', 'forge.openProject': '請開啟專案以使用鍛造坊工具。', 'forge.tab.procedural': '程序化', 'forge.tab.outfit': '服裝鍛造坊', 'forge.tab.parts': '部件 (PNG)', 'forge.style': '風格:', 'forge.frame': '影格:', 'forge.sheet': '圖表:', 'forge.saveAs': '另存為:', 'forge.saveSheet': '儲存圖表', 'forge.generateSave': '產生並儲存到素材庫',
        'db.system1': '系統 1', 'db.system2': '系統 2', 'db.search': '搜尋 {title}...', 'db.selectEntry': '從清單選擇項目', 'db.changeMaximum': '變更最大值', 'db.selectEntryToDelete': '選擇要刪除的項目', 'db.deleteConfirm': '刪除「{name}」？', 'db.unknownType': '未知資料庫類型: {type}', 'db.saved': '資料庫已儲存',
        'event.name': '事件名稱:', 'event.position': '位置:', 'event.note': '備註:', 'event.newPage': '新增事件頁', 'event.copyPage': '複製事件頁', 'event.pastePage': '貼上事件頁', 'event.deletePage': '刪除事件頁', 'event.clearPage': '清除事件頁', 'event.page': '頁面 {number}', 'event.contents': '內容', 'event.selectCommand': '選擇事件指令', 'event.conditions': '條件', 'event.image': '圖片', 'event.options': '選項', 'event.autonomousMovement': '自主移動', 'event.priority': '優先順序', 'event.trigger': '觸發',
        'status.noProjectLoaded': '未載入專案', 'status.playtestNotImplemented': '尚未實作測試遊玩模式', 'status.loadMapFirst': '請先載入地圖', 'status.eventModeEnabled': '事件模式已啟用', 'status.eventModeDisabled': '事件模式已停用', 'alert.loadProjectFirst': '請先載入專案。'
    },
    'zh-Hans': {
        'app.loading': '加载中...',
        'menu.file': '文件', 'menu.newProject': '新建项目', 'menu.openProject': '打开项目', 'menu.closeProject': '关闭项目', 'menu.options': '选项...', 'menu.exit': '退出',
        'menu.database': '数据库', 'menu.actors': '角色', 'menu.classes': '职业', 'menu.skills': '技能', 'menu.items': '物品', 'menu.weapons': '武器', 'menu.armors': '防具', 'menu.enemies': '敌人', 'menu.troops': '敌群', 'menu.states': '状态', 'menu.animations': '动画', 'menu.tilesets': '图块组', 'menu.commonEvents': '公共事件', 'menu.system': '系统', 'menu.types': '类型', 'menu.terms': '术语',
        'menu.plugins': '插件', 'menu.managePlugins': '管理插件', 'menu.tools': '工具', 'menu.eventManager': '事件管理器', 'menu.audioPlayer': '♪ 音频播放器', 'menu.forge': '锻造坊', 'menu.forgeLauncher': '锻造坊启动器', 'menu.characterGenerator': '角色生成器', 'menu.animationGenerator': '动画生成器', 'menu.soundEffectGenerator': '音效生成器', 'menu.build': '构建', 'menu.deployGame': '导出游戏...', 'menu.deployEditor': '导出编辑器...', 'menu.help': '帮助', 'menu.developerTools': '开发者工具', 'menu.about': '关于 RPG Reactor',
        'toolbar.tileset': '图块组:', 'toolbar.layer': '图层:', 'toolbar.tools': '工具:', 'toolbar.forge': '锻造坊:', 'toolbar.title.newProject': '新建项目', 'toolbar.title.openProject': '打开项目', 'toolbar.title.saveProject': '保存项目', 'toolbar.title.undo': '撤销 (Ctrl+Z)', 'toolbar.title.redo': '重做 (Ctrl+Y)', 'toolbar.title.playtest': '测试游玩', 'toolbar.title.eventManager': '事件管理器', 'toolbar.title.database': '数据库', 'toolbar.title.plugins': '插件', 'toolbar.title.audioPlayer': '音频播放器', 'toolbar.title.forgeLauncher': '锻造坊 - 开发工具套件',
        'welcome.tagline': '使用开源、跨平台引擎制作精彩 RPG 游戏', 'welcome.gettingStarted': '开始使用', 'welcome.step.create': '创建新项目开始制作 RPG', 'welcome.step.design': '设计地图、事件和游戏机制', 'welcome.step.test': '使用内置测试游玩立即试玩', 'welcome.step.export': '导出到 Windows、Mac 和 Linux',
        'sidebar.tilesetPalette': '图块组调色板', 'sidebar.events': '事件', 'sidebar.noEvents': '此地图没有事件', 'sidebar.maps': '地图', 'sidebar.mapTree': '地图树', 'sidebar.quickAccess': '快速访问', 'sidebar.noMaps': '尚无地图', 'sidebar.noQuickAccessMaps': '尚无快速访问地图', 'workspace.map': '地图', 'workspace.noMapLoaded': '未加载地图', 'workspace.zoom': '缩放:',
        'modal.eventEditor': '事件编辑器', 'modal.audioPlayer': '♪ 音频播放器', 'audio.bgm': 'BGM (音乐)', 'audio.bgs': 'BGS (环境音)', 'audio.me': 'ME (短乐句)', 'audio.se': 'SE (音效)', 'audio.noTrackSelected': '未选择音轨', 'audio.play': '播放', 'audio.pause': '暂停', 'audio.stop': '停止', 'audio.loopOff': '循环: 关', 'audio.loopOn': '循环: 开', 'audio.volume': '音量', 'audio.pitch': '音高', 'audio.pan': '声像', 'audio.center': '居中', 'audio.loadProjectFirst': '请先加载项目',
        'common.done': '完成', 'common.ok': '确定', 'common.cancel': '取消', 'common.apply': '应用', 'common.new': '新建', 'common.delete': '删除', 'common.copy': '复制', 'common.cut': '剪切', 'common.paste': '粘贴', 'common.duplicate': '复制副本', 'common.unnamed': '未命名',
        'options.title': '选项', 'options.appearance': '外观', 'options.language': '语言', 'options.palette': '配色', 'options.mode': '模式', 'options.dark': '深色', 'options.light': '浅色', 'options.themeNote': '主题会立即应用。请重新打开已打开的编辑器标签以刷新 Canvas 绘制元素。', 'options.languageNote': '语言会立即应用到已本地化的编辑器界面文字。部分深层表单会逐步本地化。',
        'about.title': '关于 RPG Reactor', 'about.description': '使用 NW.js 和 PixiJS v8 构建的开源跨平台 RPG 游戏引擎', 'about.compatibility': '使用可在 Windows、Mac 和 Linux 上运行的专业编辑器制作精彩 RPG 游戏。多数情况下兼容 RPG Maker MZ 和 MV 项目；运行时兼容性主要取决于项目的核心脚本和插件。', 'about.linksTitle': 'Psychronic 链接', 'about.itch': 'Itch.io - 插件和工具', 'about.steam': 'Steam - Psychronic 游戏', 'about.github': 'GitHub - 其他项目', 'about.youtube': 'YouTube - Psychronic Games', 'about.discord': 'Discord - 加入社区', 'about.license': '许可证: MIT',
        'forge.tools': '工具', 'forge.welcome': '资源生成工具套件。请从侧边栏或下方选择工具。', 'forge.openProject': '请打开项目以使用锻造坊工具。', 'forge.tab.procedural': '程序化', 'forge.tab.outfit': '服装锻造坊', 'forge.tab.parts': '部件 (PNG)', 'forge.style': '风格:', 'forge.frame': '帧:', 'forge.sheet': '图表:', 'forge.saveAs': '另存为:', 'forge.saveSheet': '保存图表', 'forge.generateSave': '生成并保存到素材库',
        'db.system1': '系统 1', 'db.system2': '系统 2', 'db.search': '搜索 {title}...', 'db.selectEntry': '从列表选择项目', 'db.changeMaximum': '更改最大值', 'db.selectEntryToDelete': '选择要删除的项目', 'db.deleteConfirm': '删除“{name}”？', 'db.unknownType': '未知数据库类型: {type}', 'db.saved': '数据库已保存',
        'event.name': '事件名称:', 'event.position': '位置:', 'event.note': '备注:', 'event.newPage': '新建事件页', 'event.copyPage': '复制事件页', 'event.pastePage': '粘贴事件页', 'event.deletePage': '删除事件页', 'event.clearPage': '清除事件页', 'event.page': '页面 {number}', 'event.contents': '内容', 'event.selectCommand': '选择事件指令', 'event.conditions': '条件', 'event.image': '图片', 'event.options': '选项', 'event.autonomousMovement': '自主移动', 'event.priority': '优先级', 'event.trigger': '触发',
        'status.noProjectLoaded': '未加载项目', 'status.playtestNotImplemented': '尚未实现测试游玩模式', 'status.loadMapFirst': '请先加载地图', 'status.eventModeEnabled': '事件模式已启用', 'status.eventModeDisabled': '事件模式已停用', 'alert.loadProjectFirst': '请先加载项目。'
    },
    ru: {
        'app.loading': 'Загрузка...',
        'menu.file': 'Файл', 'menu.newProject': 'Новый Проект', 'menu.openProject': 'Открыть Проект', 'menu.closeProject': 'Закрыть Проект', 'menu.options': 'Параметры...', 'menu.exit': 'Выход',
        'menu.database': 'База Данных', 'menu.actors': 'Актёры', 'menu.classes': 'Классы', 'menu.skills': 'Навыки', 'menu.items': 'Предметы', 'menu.weapons': 'Оружие', 'menu.armors': 'Броня', 'menu.enemies': 'Враги', 'menu.troops': 'Группы Врагов', 'menu.states': 'Состояния', 'menu.animations': 'Анимации', 'menu.tilesets': 'Тайлсеты', 'menu.commonEvents': 'Общие События', 'menu.system': 'Система', 'menu.types': 'Типы', 'menu.terms': 'Термины',
        'menu.plugins': 'Плагины', 'menu.managePlugins': 'Управление Плагинами', 'menu.tools': 'Инструменты', 'menu.eventManager': 'Менеджер Событий', 'menu.audioPlayer': '♪ Аудиоплеер', 'menu.forge': 'Кузница', 'menu.forgeLauncher': 'Запуск Кузницы', 'menu.characterGenerator': 'Генератор Персонажей', 'menu.animationGenerator': 'Генератор Анимаций', 'menu.soundEffectGenerator': 'Генератор Звуков', 'menu.build': 'Сборка', 'menu.deployGame': 'Экспорт Игры...', 'menu.deployEditor': 'Экспорт Редактора...', 'menu.help': 'Справка', 'menu.developerTools': 'Инструменты Разработчика', 'menu.about': 'О RPG Reactor',
        'toolbar.tileset': 'Тайлсет:', 'toolbar.layer': 'Слой:', 'toolbar.tools': 'Инструменты:', 'toolbar.forge': 'Кузница:', 'toolbar.title.newProject': 'Новый Проект', 'toolbar.title.openProject': 'Открыть Проект', 'toolbar.title.saveProject': 'Сохранить Проект', 'toolbar.title.undo': 'Отменить (Ctrl+Z)', 'toolbar.title.redo': 'Повторить (Ctrl+Y)', 'toolbar.title.playtest': 'Тест Игры', 'toolbar.title.eventManager': 'Менеджер Событий', 'toolbar.title.database': 'База Данных', 'toolbar.title.plugins': 'Плагины', 'toolbar.title.audioPlayer': 'Аудиоплеер', 'toolbar.title.forgeLauncher': 'Кузница - Набор Инструментов Разработки',
        'welcome.tagline': 'Создавайте потрясающие RPG на открытом кроссплатформенном движке', 'welcome.gettingStarted': 'Начало Работы', 'welcome.step.create': 'Создайте новый проект, чтобы начать RPG', 'welcome.step.design': 'Проектируйте карты, события и игровые механики', 'welcome.step.test': 'Сразу тестируйте игру встроенным запуском', 'welcome.step.export': 'Экспортируйте игру для Windows, Mac и Linux',
        'sidebar.tilesetPalette': 'Палитра Тайлсета', 'sidebar.events': 'События', 'sidebar.noEvents': 'На этой карте нет событий', 'sidebar.maps': 'Карты', 'sidebar.mapTree': 'Дерево Карт', 'sidebar.quickAccess': 'Быстрый Доступ', 'sidebar.noMaps': 'Карт пока нет', 'sidebar.noQuickAccessMaps': 'Карт быстрого доступа пока нет', 'workspace.map': 'Карта', 'workspace.noMapLoaded': 'Карта Не Загружена', 'workspace.zoom': 'Масштаб:',
        'modal.eventEditor': 'Редактор Событий', 'modal.audioPlayer': '♪ Аудиоплеер', 'audio.bgm': 'BGM (Музыка)', 'audio.bgs': 'BGS (Атмосфера)', 'audio.me': 'ME (Джинглы)', 'audio.se': 'SE (Эффекты)', 'audio.noTrackSelected': 'Трек не выбран', 'audio.play': 'Играть', 'audio.pause': 'Пауза', 'audio.stop': 'Стоп', 'audio.loopOff': 'Повтор: Выкл', 'audio.loopOn': 'Повтор: Вкл', 'audio.volume': 'Громкость', 'audio.pitch': 'Тон', 'audio.pan': 'Панорама', 'audio.center': 'Центр', 'audio.loadProjectFirst': 'Сначала загрузите проект',
        'common.done': 'Готово', 'common.ok': 'OK', 'common.cancel': 'Отмена', 'common.apply': 'Применить', 'common.new': 'Новый', 'common.delete': 'Удалить', 'common.copy': 'Копировать', 'common.cut': 'Вырезать', 'common.paste': 'Вставить', 'common.duplicate': 'Дублировать', 'common.unnamed': 'Без имени',
        'options.title': 'Параметры', 'options.appearance': 'Внешний Вид', 'options.language': 'Язык', 'options.palette': 'Палитра', 'options.mode': 'Режим', 'options.dark': 'Тёмный', 'options.light': 'Светлый', 'options.themeNote': 'Тема применяется сразу. Переоткройте вкладки редактора, чтобы обновить элементы Canvas.', 'options.languageNote': 'Язык сразу применяется к локализованному тексту интерфейса. Некоторые глубокие формы будут локализованы постепенно.',
        'about.title': 'О RPG Reactor', 'about.description': 'Открытый кроссплатформенный RPG-движок на NW.js и PixiJS v8', 'about.compatibility': 'Создавайте потрясающие RPG в профессиональном редакторе для Windows, Mac и Linux. В большинстве случаев совместим с проектами RPG Maker MZ и MV; совместимость во время выполнения в основном зависит от corescripts и плагинов проекта.', 'about.linksTitle': 'Ссылки Psychronic', 'about.itch': 'Itch.io - Плагины И Инструменты', 'about.steam': 'Steam - Игры Psychronic', 'about.github': 'GitHub - Другие Проекты', 'about.youtube': 'YouTube - Psychronic Games', 'about.discord': 'Discord - Присоединиться К Сообществу', 'about.license': 'Лицензия: MIT',
        'forge.tools': 'Инструменты', 'forge.welcome': 'Набор инструментов генерации ресурсов. Выберите инструмент на боковой панели или ниже.', 'forge.openProject': 'Откройте проект, чтобы использовать инструменты Кузницы.', 'forge.tab.procedural': 'Процедурно', 'forge.tab.outfit': 'Кузница Костюмов', 'forge.tab.parts': 'Части (PNG)', 'forge.style': 'Стиль:', 'forge.frame': 'Кадр:', 'forge.sheet': 'Лист:', 'forge.saveAs': 'Сохранить как:', 'forge.saveSheet': 'Сохранить Лист', 'forge.generateSave': 'Создать И Сохранить В Библиотеку',
        'db.system1': 'Система 1', 'db.system2': 'Система 2', 'db.search': 'Поиск {title}...', 'db.selectEntry': 'Выберите запись из списка', 'db.changeMaximum': 'Изменить максимум', 'db.selectEntryToDelete': 'Выберите запись для удаления', 'db.deleteConfirm': 'Удалить «{name}»?', 'db.unknownType': 'Неизвестный тип базы данных: {type}', 'db.saved': 'База данных сохранена',
        'event.name': 'Имя События:', 'event.position': 'Позиция:', 'event.note': 'Заметка:', 'event.newPage': 'Новая Страница События', 'event.copyPage': 'Копировать Страницу', 'event.pastePage': 'Вставить Страницу', 'event.deletePage': 'Удалить Страницу', 'event.clearPage': 'Очистить Страницу', 'event.page': 'Страница {number}', 'event.contents': 'Содержимое', 'event.selectCommand': 'Выберите Команду События', 'event.conditions': 'Условия', 'event.image': 'Изображение', 'event.options': 'Опции', 'event.autonomousMovement': 'Автономное Движение', 'event.priority': 'Приоритет', 'event.trigger': 'Триггер',
        'status.noProjectLoaded': 'Проект не загружен', 'status.playtestNotImplemented': 'Режим теста пока не реализован', 'status.loadMapFirst': 'Сначала загрузите карту', 'status.eventModeEnabled': 'Режим событий включён', 'status.eventModeDisabled': 'Режим событий отключён', 'alert.loadProjectFirst': 'Сначала загрузите проект.'
    },
    pt: {
        'app.loading': 'Carregando...',
        'menu.file': 'Arquivo', 'menu.newProject': 'Novo Projeto', 'menu.openProject': 'Abrir Projeto', 'menu.closeProject': 'Fechar Projeto', 'menu.options': 'Opções...', 'menu.exit': 'Sair',
        'menu.database': 'Banco De Dados', 'menu.actors': 'Atores', 'menu.classes': 'Classes', 'menu.skills': 'Habilidades', 'menu.items': 'Itens', 'menu.weapons': 'Armas', 'menu.armors': 'Armaduras', 'menu.enemies': 'Inimigos', 'menu.troops': 'Grupos Inimigos', 'menu.states': 'Estados', 'menu.animations': 'Animações', 'menu.tilesets': 'Tilesets', 'menu.commonEvents': 'Eventos Comuns', 'menu.system': 'Sistema', 'menu.types': 'Tipos', 'menu.terms': 'Termos',
        'menu.plugins': 'Extensões', 'menu.managePlugins': 'Gerenciar Extensões', 'menu.tools': 'Ferramentas', 'menu.eventManager': 'Gerenciador De Eventos', 'menu.audioPlayer': '♪ Reprodutor De Áudio', 'menu.forge': 'Forja', 'menu.forgeLauncher': 'Inicializador Da Forja', 'menu.characterGenerator': 'Gerador De Personagens', 'menu.animationGenerator': 'Gerador De Animações', 'menu.soundEffectGenerator': 'Gerador De Efeitos Sonoros', 'menu.build': 'Compilar', 'menu.deployGame': 'Exportar Jogo...', 'menu.deployEditor': 'Exportar Editor...', 'menu.help': 'Ajuda', 'menu.developerTools': 'Ferramentas De Desenvolvedor', 'menu.about': 'Sobre O RPG Reactor',
        'toolbar.tileset': 'Tileset:', 'toolbar.layer': 'Camada:', 'toolbar.tools': 'Ferramentas:', 'toolbar.forge': 'Forja:', 'toolbar.title.newProject': 'Novo Projeto', 'toolbar.title.openProject': 'Abrir Projeto', 'toolbar.title.saveProject': 'Salvar Projeto', 'toolbar.title.undo': 'Desfazer (Ctrl+Z)', 'toolbar.title.redo': 'Refazer (Ctrl+Y)', 'toolbar.title.playtest': 'Testar Jogo', 'toolbar.title.eventManager': 'Gerenciador De Eventos', 'toolbar.title.database': 'Banco De Dados', 'toolbar.title.plugins': 'Plugins', 'toolbar.title.audioPlayer': 'Reprodutor De Áudio', 'toolbar.title.forgeLauncher': 'Forja - Suíte De Ferramentas De Desenvolvimento',
        'welcome.tagline': 'Crie jogos RPG incríveis com um motor aberto e multiplataforma', 'welcome.gettingStarted': 'Primeiros Passos', 'welcome.step.create': 'Crie um novo projeto para começar seu RPG', 'welcome.step.design': 'Projete mapas, eventos e mecânicas de jogo', 'welcome.step.test': 'Teste seu jogo imediatamente com o teste integrado', 'welcome.step.export': 'Exporte seu jogo para Windows, Mac e Linux',
        'sidebar.tilesetPalette': 'Paleta De Tilesets', 'sidebar.events': 'Eventos', 'sidebar.noEvents': 'Nenhum evento neste mapa', 'sidebar.maps': 'Mapas', 'sidebar.mapTree': 'Árvore De Mapas', 'sidebar.quickAccess': 'Acesso Rápido', 'sidebar.noMaps': 'Ainda não há mapas', 'sidebar.noQuickAccessMaps': 'Ainda não há mapas de acesso rápido', 'workspace.map': 'Mapa', 'workspace.noMapLoaded': 'Nenhum Mapa Carregado', 'workspace.zoom': 'Zoom:',
        'modal.eventEditor': 'Editor De Eventos', 'modal.audioPlayer': '♪ Reprodutor De Áudio', 'audio.bgm': 'BGM (Música)', 'audio.bgs': 'BGS (Ambiente)', 'audio.me': 'ME (Vinhetas)', 'audio.se': 'SE (Efeitos)', 'audio.noTrackSelected': 'Nenhuma faixa selecionada', 'audio.play': 'Reproduzir', 'audio.pause': 'Pausar', 'audio.stop': 'Parar', 'audio.loopOff': 'Loop: Desligado', 'audio.loopOn': 'Loop: Ligado', 'audio.volume': 'Volume', 'audio.pitch': 'Tom', 'audio.pan': 'Pan', 'audio.center': 'Centro', 'audio.loadProjectFirst': 'Carregue um projeto primeiro',
        'common.done': 'Concluído', 'common.ok': 'OK', 'common.cancel': 'Cancelar', 'common.apply': 'Aplicar', 'common.new': 'Novo', 'common.delete': 'Excluir', 'common.copy': 'Copiar', 'common.cut': 'Recortar', 'common.paste': 'Colar', 'common.duplicate': 'Duplicar', 'common.unnamed': 'Sem Nome',
        'options.title': 'Opções', 'options.appearance': 'Aparência', 'options.language': 'Idioma', 'options.palette': 'Paleta', 'options.mode': 'Modo', 'options.dark': 'Escuro', 'options.light': 'Claro', 'options.themeNote': 'O tema é aplicado imediatamente. Reabra abas do editor para atualizar elementos desenhados em Canvas.', 'options.languageNote': 'O idioma é aplicado imediatamente ao texto localizado da interface. Alguns formulários profundos serão localizados gradualmente.',
        'about.title': 'Sobre O RPG Reactor', 'about.description': 'Um motor RPG aberto e multiplataforma criado com NW.js e PixiJS v8', 'about.compatibility': 'Crie jogos RPG incríveis com um editor profissional que roda no Windows, Mac e Linux. Compatível com projetos RPG Maker MZ e MV na maioria dos casos; a compatibilidade em tempo de execução depende principalmente dos corescripts e plugins do projeto.', 'about.linksTitle': 'Links Da Psychronic', 'about.itch': 'Itch.io - Plugins E Ferramentas', 'about.steam': 'Steam - Jogos Da Psychronic', 'about.github': 'GitHub - Outros Projetos', 'about.youtube': 'YouTube - Psychronic Games', 'about.discord': 'Discord - Entrar Na Comunidade', 'about.license': 'Licença: MIT',
        'forge.tools': 'Ferramentas', 'forge.welcome': 'Suíte de ferramentas de geração de recursos. Escolha uma ferramenta na barra lateral ou abaixo.', 'forge.openProject': 'Abra um projeto para usar as ferramentas da Forja.', 'forge.tab.procedural': 'Procedural', 'forge.tab.outfit': 'Forja De Roupas', 'forge.tab.parts': 'Partes (PNG)', 'forge.style': 'Estilo:', 'forge.frame': 'Quadro:', 'forge.sheet': 'Folha:', 'forge.saveAs': 'Salvar como:', 'forge.saveSheet': 'Salvar Folha', 'forge.generateSave': 'Gerar E Salvar Na Biblioteca',
        'db.system1': 'Sistema 1', 'db.system2': 'Sistema 2', 'db.search': 'Buscar {title}...', 'db.selectEntry': 'Selecione uma entrada da lista', 'db.changeMaximum': 'Alterar Máximo', 'db.selectEntryToDelete': 'Selecione uma entrada para excluir', 'db.deleteConfirm': 'Excluir "{name}"?', 'db.unknownType': 'Tipo de banco de dados desconhecido: {type}', 'db.saved': 'Banco de dados salvo',
        'event.name': 'Nome Do Evento:', 'event.position': 'Posição:', 'event.note': 'Nota:', 'event.newPage': 'Nova Página De Evento', 'event.copyPage': 'Copiar Página De Evento', 'event.pastePage': 'Colar Página De Evento', 'event.deletePage': 'Excluir Página De Evento', 'event.clearPage': 'Limpar Página De Evento', 'event.page': 'Página {number}', 'event.contents': 'Conteúdo', 'event.selectCommand': 'Selecionar Comando De Evento', 'event.conditions': 'Condições', 'event.image': 'Imagem', 'event.options': 'Opções', 'event.autonomousMovement': 'Movimento Autônomo', 'event.priority': 'Prioridade', 'event.trigger': 'Gatilho',
        'status.noProjectLoaded': 'Nenhum projeto carregado', 'status.playtestNotImplemented': 'Modo de teste ainda não implementado', 'status.loadMapFirst': 'Carregue um mapa primeiro', 'status.eventModeEnabled': 'Modo de eventos ativado', 'status.eventModeDisabled': 'Modo de eventos desativado', 'alert.loadProjectFirst': 'Carregue um projeto primeiro.'
    },
    de: {
        'app.loading': 'Laden...',
        'menu.file': 'Datei', 'menu.newProject': 'Neues Projekt', 'menu.openProject': 'Projekt öffnen', 'menu.closeProject': 'Projekt schließen', 'menu.options': 'Optionen...', 'menu.exit': 'Beenden',
        'menu.database': 'Datenbank', 'menu.actors': 'Akteure', 'menu.classes': 'Klassen', 'menu.skills': 'Fähigkeiten', 'menu.items': 'Gegenstände', 'menu.weapons': 'Waffen', 'menu.armors': 'Rüstungen', 'menu.enemies': 'Gegner', 'menu.troops': 'Truppen', 'menu.states': 'Zustände', 'menu.animations': 'Animationen', 'menu.tilesets': 'Tilesets', 'menu.commonEvents': 'Gemeinsame Ereignisse', 'menu.system': 'System', 'menu.types': 'Typen', 'menu.terms': 'Begriffe',
        'menu.plugins': 'Erweiterungen', 'menu.managePlugins': 'Erweiterungen verwalten', 'menu.tools': 'Werkzeuge', 'menu.eventManager': 'Ereignisverwaltung', 'menu.audioPlayer': '♪ Audioplayer', 'menu.forge': 'Schmiede', 'menu.forgeLauncher': 'Schmiede starten', 'menu.characterGenerator': 'Charaktergenerator', 'menu.animationGenerator': 'Animationsgenerator', 'menu.soundEffectGenerator': 'Soundeffektgenerator', 'menu.build': 'Erstellen', 'menu.deployGame': 'Spiel exportieren...', 'menu.deployEditor': 'Editor exportieren...', 'menu.help': 'Hilfe', 'menu.developerTools': 'Entwicklerwerkzeuge', 'menu.about': 'Über RPG Reactor',
        'toolbar.tileset': 'Tileset:', 'toolbar.layer': 'Ebene:', 'toolbar.tools': 'Werkzeuge:', 'toolbar.forge': 'Schmiede:', 'toolbar.title.newProject': 'Neues Projekt', 'toolbar.title.openProject': 'Projekt öffnen', 'toolbar.title.saveProject': 'Projekt speichern', 'toolbar.title.undo': 'Rückgängig (Strg+Z)', 'toolbar.title.redo': 'Wiederholen (Strg+Y)', 'toolbar.title.playtest': 'Testspiel', 'toolbar.title.eventManager': 'Ereignisverwaltung', 'toolbar.title.database': 'Datenbank', 'toolbar.title.plugins': 'Plugins', 'toolbar.title.audioPlayer': 'Audioplayer', 'toolbar.title.forgeLauncher': 'Schmiede - Entwicklungswerkzeuge',
        'welcome.tagline': 'Erstelle großartige RPGs mit einer quelloffenen, plattformübergreifenden Engine', 'welcome.gettingStarted': 'Erste Schritte', 'welcome.step.create': 'Erstelle ein neues Projekt, um dein RPG zu beginnen', 'welcome.step.design': 'Gestalte Karten, Ereignisse und Spielmechaniken', 'welcome.step.test': 'Teste dein Spiel sofort mit der integrierten Testfunktion', 'welcome.step.export': 'Exportiere dein Spiel für Windows, Mac und Linux',
        'sidebar.tilesetPalette': 'Tileset-Palette', 'sidebar.events': 'Ereignisse', 'sidebar.noEvents': 'Keine Ereignisse auf dieser Karte', 'sidebar.maps': 'Karten', 'sidebar.mapTree': 'Kartenbaum', 'sidebar.quickAccess': 'Schnellzugriff', 'sidebar.noMaps': 'Noch keine Karten', 'sidebar.noQuickAccessMaps': 'Noch keine Schnellzugriffskarten', 'workspace.map': 'Karte', 'workspace.noMapLoaded': 'Keine Karte geladen', 'workspace.zoom': 'Zoom:',
        'modal.eventEditor': 'Ereigniseditor', 'modal.audioPlayer': '♪ Audioplayer', 'audio.bgm': 'BGM (Musik)', 'audio.bgs': 'BGS (Ambiente)', 'audio.me': 'ME (Jingles)', 'audio.se': 'SE (Effekte)', 'audio.noTrackSelected': 'Kein Track ausgewählt', 'audio.play': 'Abspielen', 'audio.pause': 'Pause', 'audio.stop': 'Stopp', 'audio.loopOff': 'Schleife: Aus', 'audio.loopOn': 'Schleife: Ein', 'audio.volume': 'Lautstärke', 'audio.pitch': 'Tonhöhe', 'audio.pan': 'Panorama', 'audio.center': 'Mitte', 'audio.loadProjectFirst': 'Bitte zuerst ein Projekt laden',
        'common.done': 'Fertig', 'common.ok': 'OK', 'common.cancel': 'Abbrechen', 'common.apply': 'Anwenden', 'common.new': 'Neu', 'common.delete': 'Löschen', 'common.copy': 'Kopieren', 'common.cut': 'Ausschneiden', 'common.paste': 'Einfügen', 'common.duplicate': 'Duplizieren', 'common.unnamed': 'Unbenannt',
        'options.title': 'Optionen', 'options.appearance': 'Darstellung', 'options.language': 'Sprache', 'options.palette': 'Palette', 'options.mode': 'Modus', 'options.dark': 'Dunkel', 'options.light': 'Hell', 'options.themeNote': 'Das Design wird sofort angewendet. Öffne aktive Editor-Tabs erneut, um Canvas-Elemente zu aktualisieren.', 'options.languageNote': 'Die Sprache wird sofort auf lokalisierte Editor-Texte angewendet. Einige tiefe Editorformulare werden schrittweise lokalisiert.',
        'about.title': 'Über RPG Reactor', 'about.description': 'Eine quelloffene, plattformübergreifende RPG-Engine mit NW.js und PixiJS v8', 'about.compatibility': 'Erstelle großartige RPGs mit einem professionellen Editor für Windows, Mac und Linux. In den meisten Fällen kompatibel mit RPG Maker MZ- und MV-Projekten; Laufzeitkompatibilität hängt hauptsächlich von Corescripts und Plugins des Projekts ab.', 'about.linksTitle': 'Psychronic-Links', 'about.itch': 'Itch.io - Plugins und Werkzeuge', 'about.steam': 'Steam - Psychronic Games', 'about.github': 'GitHub - Weitere Projekte', 'about.youtube': 'YouTube - Psychronic Games', 'about.discord': 'Discord - Community beitreten', 'about.license': 'Lizenz: MIT',
        'forge.tools': 'Werkzeuge', 'forge.welcome': 'Werkzeugsuite zur Asset-Erzeugung. Wähle ein Werkzeug in der Seitenleiste oder unten.', 'forge.openProject': 'Öffne ein Projekt, um Schmiede-Werkzeuge zu verwenden.', 'forge.tab.procedural': 'Prozedural', 'forge.tab.outfit': 'Outfit-Schmiede', 'forge.tab.parts': 'Teile (PNG)', 'forge.style': 'Stil:', 'forge.frame': 'Frame:', 'forge.sheet': 'Sheet:', 'forge.saveAs': 'Speichern als:', 'forge.saveSheet': 'Sheet speichern', 'forge.generateSave': 'Erzeugen und in Bibliothek speichern',
        'db.system1': 'System 1', 'db.system2': 'System 2', 'db.search': '{title} suchen...', 'db.selectEntry': 'Eintrag aus der Liste auswählen', 'db.changeMaximum': 'Maximum ändern', 'db.selectEntryToDelete': 'Eintrag zum Löschen auswählen', 'db.deleteConfirm': '„{name}“ löschen?', 'db.unknownType': 'Unbekannter Datenbanktyp: {type}', 'db.saved': 'Datenbank gespeichert',
        'event.name': 'Ereignisname:', 'event.position': 'Position:', 'event.note': 'Notiz:', 'event.newPage': 'Neue Ereignisseite', 'event.copyPage': 'Ereignisseite kopieren', 'event.pastePage': 'Ereignisseite einfügen', 'event.deletePage': 'Ereignisseite löschen', 'event.clearPage': 'Ereignisseite leeren', 'event.page': 'Seite {number}', 'event.contents': 'Inhalt', 'event.selectCommand': 'Ereignisbefehl auswählen', 'event.conditions': 'Bedingungen', 'event.image': 'Bild', 'event.options': 'Optionen', 'event.autonomousMovement': 'Autonome Bewegung', 'event.priority': 'Priorität', 'event.trigger': 'Auslöser',
        'status.noProjectLoaded': 'Kein Projekt geladen', 'status.playtestNotImplemented': 'Testmodus noch nicht implementiert', 'status.loadMapFirst': 'Zuerst eine Karte laden', 'status.eventModeEnabled': 'Ereignismodus aktiviert', 'status.eventModeDisabled': 'Ereignismodus deaktiviert', 'alert.loadProjectFirst': 'Bitte zuerst ein Projekt laden.'
    },
    fr: {
        'app.loading': 'Chargement...',
        'menu.file': 'Fichier', 'menu.newProject': 'Nouveau projet', 'menu.openProject': 'Ouvrir un projet', 'menu.closeProject': 'Fermer le projet', 'menu.options': 'Options...', 'menu.exit': 'Quitter',
        'menu.database': 'Base de données', 'menu.actors': 'Acteurs', 'menu.classes': 'Classes', 'menu.skills': 'Compétences', 'menu.items': 'Objets', 'menu.weapons': 'Armes', 'menu.armors': 'Armures', 'menu.enemies': 'Ennemis', 'menu.troops': 'Groupes', 'menu.states': 'États', 'menu.animations': 'Animations', 'menu.tilesets': 'Tilesets', 'menu.commonEvents': 'Événements communs', 'menu.system': 'Système', 'menu.types': 'Types', 'menu.terms': 'Termes',
        'menu.plugins': 'Extensions', 'menu.managePlugins': 'Gérer les extensions', 'menu.tools': 'Outils', 'menu.eventManager': 'Gestionnaire d’événements', 'menu.audioPlayer': '♪ Lecteur audio', 'menu.forge': 'Forge', 'menu.forgeLauncher': 'Lanceur de forge', 'menu.characterGenerator': 'Générateur de personnages', 'menu.animationGenerator': 'Générateur d’animations', 'menu.soundEffectGenerator': 'Générateur d’effets sonores', 'menu.build': 'Compilation', 'menu.deployGame': 'Exporter le jeu...', 'menu.deployEditor': 'Exporter l’éditeur...', 'menu.help': 'Aide', 'menu.developerTools': 'Outils développeur', 'menu.about': 'À propos de RPG Reactor',
        'toolbar.tileset': 'Tileset:', 'toolbar.layer': 'Calque:', 'toolbar.tools': 'Outils:', 'toolbar.forge': 'Forge:', 'toolbar.title.newProject': 'Nouveau projet', 'toolbar.title.openProject': 'Ouvrir un projet', 'toolbar.title.saveProject': 'Enregistrer le projet', 'toolbar.title.undo': 'Annuler (Ctrl+Z)', 'toolbar.title.redo': 'Rétablir (Ctrl+Y)', 'toolbar.title.playtest': 'Test du jeu', 'toolbar.title.eventManager': 'Gestionnaire d’événements', 'toolbar.title.database': 'Base de données', 'toolbar.title.plugins': 'Plugins', 'toolbar.title.audioPlayer': 'Lecteur audio', 'toolbar.title.forgeLauncher': 'Forge - Suite d’outils de développement',
        'welcome.tagline': 'Créez des RPG incroyables avec un moteur open source multiplateforme', 'welcome.gettingStarted': 'Premiers pas', 'welcome.step.create': 'Créez un nouveau projet pour commencer votre RPG', 'welcome.step.design': 'Concevez des cartes, événements et mécaniques de jeu', 'welcome.step.test': 'Testez instantanément votre jeu avec la fonction intégrée', 'welcome.step.export': 'Exportez votre jeu pour Windows, Mac et Linux',
        'sidebar.tilesetPalette': 'Palette de tilesets', 'sidebar.events': 'Événements', 'sidebar.noEvents': 'Aucun événement sur cette carte', 'sidebar.maps': 'Cartes', 'sidebar.mapTree': 'Arborescence des cartes', 'sidebar.quickAccess': 'Accès rapide', 'sidebar.noMaps': 'Aucune carte pour le moment', 'sidebar.noQuickAccessMaps': 'Aucune carte en accès rapide', 'workspace.map': 'Carte', 'workspace.noMapLoaded': 'Aucune carte chargée', 'workspace.zoom': 'Zoom:',
        'modal.eventEditor': 'Éditeur d’événements', 'modal.audioPlayer': '♪ Lecteur audio', 'audio.bgm': 'BGM (Musique)', 'audio.bgs': 'BGS (Ambiance)', 'audio.me': 'ME (Jingles)', 'audio.se': 'SE (Effets)', 'audio.noTrackSelected': 'Aucune piste sélectionnée', 'audio.play': 'Lire', 'audio.pause': 'Pause', 'audio.stop': 'Arrêter', 'audio.loopOff': 'Boucle: désactivée', 'audio.loopOn': 'Boucle: activée', 'audio.volume': 'Volume', 'audio.pitch': 'Hauteur', 'audio.pan': 'Panoramique', 'audio.center': 'Centre', 'audio.loadProjectFirst': 'Veuillez d’abord charger un projet',
        'common.done': 'Terminé', 'common.ok': 'OK', 'common.cancel': 'Annuler', 'common.apply': 'Appliquer', 'common.new': 'Nouveau', 'common.delete': 'Supprimer', 'common.copy': 'Copier', 'common.cut': 'Couper', 'common.paste': 'Coller', 'common.duplicate': 'Dupliquer', 'common.unnamed': 'Sans nom',
        'options.title': 'Options', 'options.appearance': 'Apparence', 'options.language': 'Langue', 'options.palette': 'Palette', 'options.mode': 'Mode', 'options.dark': 'Sombre', 'options.light': 'Clair', 'options.themeNote': 'Le thème s’applique immédiatement. Rouvrez les onglets d’éditeur ouverts pour rafraîchir les éléments Canvas.', 'options.languageNote': 'La langue s’applique immédiatement au texte localisé de l’interface. Certains formulaires profonds seront localisés progressivement.',
        'about.title': 'À propos de RPG Reactor', 'about.description': 'Un moteur RPG open source multiplateforme construit avec NW.js et PixiJS v8', 'about.compatibility': 'Créez des RPG incroyables avec un éditeur professionnel pour Windows, Mac et Linux. Compatible avec les projets RPG Maker MZ et MV dans la plupart des cas; la compatibilité à l’exécution dépend surtout des corescripts et plugins du projet.', 'about.linksTitle': 'Liens Psychronic', 'about.itch': 'Itch.io - Plugins et outils', 'about.steam': 'Steam - Jeux Psychronic', 'about.github': 'GitHub - Autres projets', 'about.youtube': 'YouTube - Psychronic Games', 'about.discord': 'Discord - Rejoindre la communauté', 'about.license': 'Licence: MIT',
        'forge.tools': 'Outils', 'forge.welcome': 'Suite d’outils de génération d’assets. Choisissez un outil dans la barre latérale ou ci-dessous.', 'forge.openProject': 'Ouvrez un projet pour utiliser les outils de la forge.', 'forge.tab.procedural': 'Procédural', 'forge.tab.outfit': 'Forge de tenues', 'forge.tab.parts': 'Pièces (PNG)', 'forge.style': 'Style:', 'forge.frame': 'Image:', 'forge.sheet': 'Feuille:', 'forge.saveAs': 'Enregistrer sous:', 'forge.saveSheet': 'Enregistrer la feuille', 'forge.generateSave': 'Générer et enregistrer dans la bibliothèque',
        'db.system1': 'Système 1', 'db.system2': 'Système 2', 'db.search': 'Rechercher {title}...', 'db.selectEntry': 'Sélectionnez une entrée dans la liste', 'db.changeMaximum': 'Modifier le maximum', 'db.selectEntryToDelete': 'Sélectionnez une entrée à supprimer', 'db.deleteConfirm': 'Supprimer « {name} » ?', 'db.unknownType': 'Type de base de données inconnu: {type}', 'db.saved': 'Base de données enregistrée',
        'event.name': 'Nom de l’événement:', 'event.position': 'Position:', 'event.note': 'Note:', 'event.newPage': 'Nouvelle page d’événement', 'event.copyPage': 'Copier la page d’événement', 'event.pastePage': 'Coller la page d’événement', 'event.deletePage': 'Supprimer la page d’événement', 'event.clearPage': 'Effacer la page d’événement', 'event.page': 'Page {number}', 'event.contents': 'Contenu', 'event.selectCommand': 'Sélectionner une commande d’événement', 'event.conditions': 'Conditions', 'event.image': 'Image', 'event.options': 'Options', 'event.autonomousMovement': 'Mouvement autonome', 'event.priority': 'Priorité', 'event.trigger': 'Déclencheur',
        'status.noProjectLoaded': 'Aucun projet chargé', 'status.playtestNotImplemented': 'Mode test non encore implémenté', 'status.loadMapFirst': 'Chargez d’abord une carte', 'status.eventModeEnabled': 'Mode événements activé', 'status.eventModeDisabled': 'Mode événements désactivé', 'alert.loadProjectFirst': 'Veuillez d’abord charger un projet.'
    },
    el: {
        'app.loading': 'Φόρτωση...',
        'menu.file': 'Αρχείο', 'menu.newProject': 'Νέο έργο', 'menu.openProject': 'Άνοιγμα έργου', 'menu.closeProject': 'Κλείσιμο έργου', 'menu.options': 'Επιλογές...', 'menu.exit': 'Έξοδος',
        'menu.database': 'Βάση δεδομένων', 'menu.actors': 'Ηθοποιοί', 'menu.classes': 'Κλάσεις', 'menu.skills': 'Δεξιότητες', 'menu.items': 'Αντικείμενα', 'menu.weapons': 'Όπλα', 'menu.armors': 'Πανοπλίες', 'menu.enemies': 'Εχθροί', 'menu.troops': 'Ομάδες εχθρών', 'menu.states': 'Καταστάσεις', 'menu.animations': 'Κινούμενα', 'menu.tilesets': 'Tilesets', 'menu.commonEvents': 'Κοινά γεγονότα', 'menu.system': 'Σύστημα', 'menu.types': 'Τύποι', 'menu.terms': 'Όροι',
        'menu.plugins': 'Πρόσθετα', 'menu.managePlugins': 'Διαχείριση προσθέτων', 'menu.tools': 'Εργαλεία', 'menu.eventManager': 'Διαχειριστής γεγονότων', 'menu.audioPlayer': '♪ Αναπαραγωγή ήχου', 'menu.forge': 'Σφυρηλατήριο', 'menu.forgeLauncher': 'Εκκίνηση σφυρηλατηρίου', 'menu.characterGenerator': 'Γεννήτρια χαρακτήρων', 'menu.animationGenerator': 'Γεννήτρια κινουμένων', 'menu.soundEffectGenerator': 'Γεννήτρια ηχητικών εφέ', 'menu.build': 'Δημιουργία', 'menu.deployGame': 'Εξαγωγή παιχνιδιού...', 'menu.deployEditor': 'Εξαγωγή editor...', 'menu.help': 'Βοήθεια', 'menu.developerTools': 'Εργαλεία προγραμματιστή', 'menu.about': 'Σχετικά με το RPG Reactor',
        'toolbar.tileset': 'Tileset:', 'toolbar.layer': 'Επίπεδο:', 'toolbar.tools': 'Εργαλεία:', 'toolbar.forge': 'Σφυρηλατήριο:', 'toolbar.title.newProject': 'Νέο έργο', 'toolbar.title.openProject': 'Άνοιγμα έργου', 'toolbar.title.saveProject': 'Αποθήκευση έργου', 'toolbar.title.undo': 'Αναίρεση (Ctrl+Z)', 'toolbar.title.redo': 'Επανάληψη (Ctrl+Y)', 'toolbar.title.playtest': 'Δοκιμή παιχνιδιού', 'toolbar.title.eventManager': 'Διαχειριστής γεγονότων', 'toolbar.title.database': 'Βάση δεδομένων', 'toolbar.title.plugins': 'Plugins', 'toolbar.title.audioPlayer': 'Αναπαραγωγή ήχου', 'toolbar.title.forgeLauncher': 'Σφυρηλατήριο - Σουίτα εργαλείων ανάπτυξης',
        'welcome.tagline': 'Δημιουργήστε εντυπωσιακά RPG με ανοιχτή, πολυπλατφορμική μηχανή', 'welcome.gettingStarted': 'Πρώτα βήματα', 'welcome.step.create': 'Δημιουργήστε νέο έργο για να ξεκινήσετε το RPG σας', 'welcome.step.design': 'Σχεδιάστε χάρτες, γεγονότα και μηχανισμούς παιχνιδιού', 'welcome.step.test': 'Δοκιμάστε αμέσως το παιχνίδι με την ενσωματωμένη λειτουργία', 'welcome.step.export': 'Εξαγάγετε το παιχνίδι για Windows, Mac και Linux',
        'sidebar.tilesetPalette': 'Παλέτα tileset', 'sidebar.events': 'Γεγονότα', 'sidebar.noEvents': 'Δεν υπάρχουν γεγονότα σε αυτόν τον χάρτη', 'sidebar.maps': 'Χάρτες', 'sidebar.mapTree': 'Δέντρο χαρτών', 'sidebar.quickAccess': 'Γρήγορη πρόσβαση', 'sidebar.noMaps': 'Δεν υπάρχουν ακόμη χάρτες', 'sidebar.noQuickAccessMaps': 'Δεν υπάρχουν ακόμη χάρτες γρήγορης πρόσβασης', 'workspace.map': 'Χάρτης', 'workspace.noMapLoaded': 'Δεν έχει φορτωθεί χάρτης', 'workspace.zoom': 'Ζουμ:',
        'modal.eventEditor': 'Editor γεγονότων', 'modal.audioPlayer': '♪ Αναπαραγωγή ήχου', 'audio.bgm': 'BGM (Μουσική)', 'audio.bgs': 'BGS (Ατμόσφαιρα)', 'audio.me': 'ME (Jingles)', 'audio.se': 'SE (Εφέ)', 'audio.noTrackSelected': 'Δεν έχει επιλεγεί κομμάτι', 'audio.play': 'Αναπαραγωγή', 'audio.pause': 'Παύση', 'audio.stop': 'Στοπ', 'audio.loopOff': 'Επανάληψη: Όχι', 'audio.loopOn': 'Επανάληψη: Ναι', 'audio.volume': 'Ένταση', 'audio.pitch': 'Τόνος', 'audio.pan': 'Πανόραμα', 'audio.center': 'Κέντρο', 'audio.loadProjectFirst': 'Φορτώστε πρώτα ένα έργο',
        'common.done': 'Τέλος', 'common.ok': 'OK', 'common.cancel': 'Άκυρο', 'common.apply': 'Εφαρμογή', 'common.new': 'Νέο', 'common.delete': 'Διαγραφή', 'common.copy': 'Αντιγραφή', 'common.cut': 'Αποκοπή', 'common.paste': 'Επικόλληση', 'common.duplicate': 'Διπλότυπο', 'common.unnamed': 'Χωρίς όνομα',
        'options.title': 'Επιλογές', 'options.appearance': 'Εμφάνιση', 'options.language': 'Γλώσσα', 'options.palette': 'Παλέτα', 'options.mode': 'Λειτουργία', 'options.dark': 'Σκούρο', 'options.light': 'Ανοιχτό', 'options.themeNote': 'Το θέμα εφαρμόζεται αμέσως. Ανοίξτε ξανά τα ανοιχτά tabs editor για ανανέωση στοιχείων Canvas.', 'options.languageNote': 'Η γλώσσα εφαρμόζεται αμέσως στο μεταφρασμένο κείμενο του editor. Ορισμένες βαθιές φόρμες θα μεταφραστούν σταδιακά.',
        'about.title': 'Σχετικά με το RPG Reactor', 'about.description': 'Μια ανοιχτή, πολυπλατφορμική RPG μηχανή με NW.js και PixiJS v8', 'about.compatibility': 'Δημιουργήστε εντυπωσιακά RPG με επαγγελματικό editor για Windows, Mac και Linux. Συμβατό με έργα RPG Maker MZ και MV στις περισσότερες περιπτώσεις· η συμβατότητα εκτέλεσης εξαρτάται κυρίως από τα corescripts και plugins του έργου.', 'about.linksTitle': 'Σύνδεσμοι Psychronic', 'about.itch': 'Itch.io - Plugins και εργαλεία', 'about.steam': 'Steam - Παιχνίδια Psychronic', 'about.github': 'GitHub - Άλλα έργα', 'about.youtube': 'YouTube - Psychronic Games', 'about.discord': 'Discord - Συμμετοχή στην κοινότητα', 'about.license': 'Άδεια: MIT',
        'forge.tools': 'Εργαλεία', 'forge.welcome': 'Σουίτα εργαλείων παραγωγής assets. Επιλέξτε εργαλείο από την πλαϊνή μπάρα ή παρακάτω.', 'forge.openProject': 'Ανοίξτε ένα έργο για χρήση των εργαλείων σφυρηλατηρίου.', 'forge.tab.procedural': 'Διαδικαστικό', 'forge.tab.outfit': 'Σφυρηλατήριο ενδυμάτων', 'forge.tab.parts': 'Μέρη (PNG)', 'forge.style': 'Στυλ:', 'forge.frame': 'Καρέ:', 'forge.sheet': 'Φύλλο:', 'forge.saveAs': 'Αποθήκευση ως:', 'forge.saveSheet': 'Αποθήκευση φύλλου', 'forge.generateSave': 'Δημιουργία και αποθήκευση στη βιβλιοθήκη',
        'db.system1': 'Σύστημα 1', 'db.system2': 'Σύστημα 2', 'db.search': 'Αναζήτηση {title}...', 'db.selectEntry': 'Επιλέξτε καταχώρηση από τη λίστα', 'db.changeMaximum': 'Αλλαγή μέγιστου', 'db.selectEntryToDelete': 'Επιλέξτε καταχώρηση για διαγραφή', 'db.deleteConfirm': 'Διαγραφή «{name}»;', 'db.unknownType': 'Άγνωστος τύπος βάσης δεδομένων: {type}', 'db.saved': 'Η βάση δεδομένων αποθηκεύτηκε',
        'event.name': 'Όνομα γεγονότος:', 'event.position': 'Θέση:', 'event.note': 'Σημείωση:', 'event.newPage': 'Νέα σελίδα γεγονότος', 'event.copyPage': 'Αντιγραφή σελίδας γεγονότος', 'event.pastePage': 'Επικόλληση σελίδας γεγονότος', 'event.deletePage': 'Διαγραφή σελίδας γεγονότος', 'event.clearPage': 'Καθαρισμός σελίδας γεγονότος', 'event.page': 'Σελίδα {number}', 'event.contents': 'Περιεχόμενα', 'event.selectCommand': 'Επιλογή εντολής γεγονότος', 'event.conditions': 'Συνθήκες', 'event.image': 'Εικόνα', 'event.options': 'Επιλογές', 'event.autonomousMovement': 'Αυτόνομη κίνηση', 'event.priority': 'Προτεραιότητα', 'event.trigger': 'Ενεργοποίηση',
        'status.noProjectLoaded': 'Δεν έχει φορτωθεί έργο', 'status.playtestNotImplemented': 'Η λειτουργία δοκιμής δεν έχει υλοποιηθεί ακόμη', 'status.loadMapFirst': 'Φορτώστε πρώτα έναν χάρτη', 'status.eventModeEnabled': 'Η λειτουργία γεγονότων ενεργοποιήθηκε', 'status.eventModeDisabled': 'Η λειτουργία γεγονότων απενεργοποιήθηκε', 'alert.loadProjectFirst': 'Φορτώστε πρώτα ένα έργο.'
    }
};

for (const [locale, overrides] of Object.entries(RR_ADDITIONAL_LOCALES)) {
    RR_I18N_STRINGS[locale] = { ...RR_I18N_STRINGS.en, ...overrides };
}

const RR_TEXT_TRANSLATIONS = {
    ja: {
        'Name': '名前', 'Name:': '名前:', 'Description': '説明', 'Description:': '説明:', 'Icon': 'アイコン', 'Icon:': 'アイコン:', 'Price': '価格', 'Price:': '価格:', 'Type': 'タイプ', 'Type:': 'タイプ:', 'Scope': '範囲', 'Scope:': '範囲:', 'Occasion': '使用時', 'Occasion:': '使用時:', 'Speed': '速度', 'Speed:': '速度:', 'Success Rate': '成功率', 'Success Rate:': '成功率:', 'Repeats': '連続回数', 'Repeats:': '連続回数:', 'Hit Type': '命中タイプ', 'Hit Type:': '命中タイプ:', 'Animation ID': 'アニメーションID', 'Animation ID:': 'アニメーションID:', 'Damage': 'ダメージ', 'Effects': '使用効果', 'Traits': '特徴', 'Note': 'メモ', 'Add': '追加', 'Edit': '編集', 'Browse': '参照', 'Fixed': '固定', 'Constant': '定数', 'Increase': '増加', 'Decrease': '減少', 'Actor': 'アクター', 'Actor:': 'アクター:', 'Enemy': '敵キャラ', 'Enemy:': '敵キャラ:', 'Skill': 'スキル', 'Skill:': 'スキル:', 'Target': '対象', 'Target:': '対象:', 'Duration:': '時間:', 'seconds': '秒', 'Start': '開始', 'Picture #:': 'ピクチャ番号:', 'Origin:': '原点:', 'Blend Mode:': '合成方法:', 'Enter picture filename': 'ピクチャファイル名を入力', 'Edit Trait': '特徴の編集', 'Edit Effect': '使用効果の編集', 'System data not loaded': 'システムデータが読み込まれていません'
    },
    es: {
        'Name': 'Nombre', 'Name:': 'Nombre:', 'Description': 'Descripción', 'Description:': 'Descripción:', 'Icon': 'Icono', 'Icon:': 'Icono:', 'Price': 'Precio', 'Price:': 'Precio:', 'Type': 'Tipo', 'Type:': 'Tipo:', 'Scope': 'Alcance', 'Scope:': 'Alcance:', 'Occasion': 'Ocasión', 'Occasion:': 'Ocasión:', 'Speed': 'Velocidad', 'Speed:': 'Velocidad:', 'Success Rate': 'Tasa de éxito', 'Success Rate:': 'Tasa de éxito:', 'Repeats': 'Repeticiones', 'Repeats:': 'Repeticiones:', 'Hit Type': 'Tipo de golpe', 'Hit Type:': 'Tipo de golpe:', 'Animation ID': 'ID de animación', 'Animation ID:': 'ID de animación:', 'Damage': 'Daño', 'Effects': 'Efectos', 'Traits': 'Rasgos', 'Note': 'Nota', 'Add': 'Agregar', 'Edit': 'Editar', 'Browse': 'Examinar', 'Fixed': 'Fijo', 'Constant': 'Constante', 'Increase': 'Aumentar', 'Decrease': 'Disminuir', 'Actor': 'Actor', 'Actor:': 'Actor:', 'Enemy': 'Enemigo', 'Enemy:': 'Enemigo:', 'Skill': 'Habilidad', 'Skill:': 'Habilidad:', 'Target': 'Objetivo', 'Target:': 'Objetivo:', 'Duration:': 'Duración:', 'seconds': 'segundos', 'Start': 'Iniciar', 'Picture #:': 'Imagen n.º:', 'Origin:': 'Origen:', 'Blend Mode:': 'Modo de mezcla:', 'Enter picture filename': 'Introduce el nombre del archivo de imagen', 'Edit Trait': 'Editar rasgo', 'Edit Effect': 'Editar efecto', 'System data not loaded': 'Datos del sistema no cargados'
    },
    'zh-Hant': {
        'Name': '名稱', 'Name:': '名稱:', 'Description': '說明', 'Description:': '說明:', 'Icon': '圖示', 'Icon:': '圖示:', 'Price': '價格', 'Price:': '價格:', 'Type': '類型', 'Type:': '類型:', 'Scope': '範圍', 'Scope:': '範圍:', 'Occasion': '時機', 'Occasion:': '時機:', 'Speed': '速度', 'Speed:': '速度:', 'Success Rate': '成功率', 'Success Rate:': '成功率:', 'Repeats': '重複次數', 'Repeats:': '重複次數:', 'Hit Type': '命中類型', 'Hit Type:': '命中類型:', 'Animation ID': '動畫 ID', 'Animation ID:': '動畫 ID:', 'Damage': '傷害', 'Effects': '效果', 'Traits': '特性', 'Note': '備註', 'Add': '新增', 'Edit': '編輯', 'Browse': '瀏覽', 'Fixed': '固定', 'Constant': '常數', 'Increase': '增加', 'Decrease': '減少', 'Actor': '角色', 'Actor:': '角色:', 'Enemy': '敵人', 'Enemy:': '敵人:', 'Skill': '技能', 'Skill:': '技能:', 'Target': '目標', 'Target:': '目標:', 'Duration:': '持續時間:', 'seconds': '秒', 'Start': '開始', 'Picture #:': '圖片編號:', 'Origin:': '原點:', 'Blend Mode:': '混合模式:', 'Enter picture filename': '輸入圖片檔名', 'Edit Trait': '編輯特性', 'Edit Effect': '編輯效果', 'System data not loaded': '系統資料未載入', 'Show Text': '顯示文字', 'Show Choices': '顯示選項', 'Control Switches': '控制開關', 'Control Variables': '控制變數', 'Conditional Branch': '條件分歧', 'Transfer Player': '玩家移動', 'Wait': '等待', 'Script': '腳本', 'Plugin Command': '外掛指令'
    },
    'zh-Hans': {
        'Name': '名称', 'Name:': '名称:', 'Description': '说明', 'Description:': '说明:', 'Icon': '图标', 'Icon:': '图标:', 'Price': '价格', 'Price:': '价格:', 'Type': '类型', 'Type:': '类型:', 'Scope': '范围', 'Scope:': '范围:', 'Occasion': '时机', 'Occasion:': '时机:', 'Speed': '速度', 'Speed:': '速度:', 'Success Rate': '成功率', 'Success Rate:': '成功率:', 'Repeats': '重复次数', 'Repeats:': '重复次数:', 'Hit Type': '命中类型', 'Hit Type:': '命中类型:', 'Animation ID': '动画 ID', 'Animation ID:': '动画 ID:', 'Damage': '伤害', 'Effects': '效果', 'Traits': '特性', 'Note': '备注', 'Add': '新建', 'Edit': '编辑', 'Browse': '浏览', 'Fixed': '固定', 'Constant': '常量', 'Increase': '增加', 'Decrease': '减少', 'Actor': '角色', 'Actor:': '角色:', 'Enemy': '敌人', 'Enemy:': '敌人:', 'Skill': '技能', 'Skill:': '技能:', 'Target': '目标', 'Target:': '目标:', 'Duration:': '持续时间:', 'seconds': '秒', 'Start': '开始', 'Picture #:': '图片编号:', 'Origin:': '原点:', 'Blend Mode:': '混合模式:', 'Enter picture filename': '输入图片文件名', 'Edit Trait': '编辑特性', 'Edit Effect': '编辑效果', 'System data not loaded': '系统数据未加载', 'Show Text': '显示文本', 'Show Choices': '显示选项', 'Control Switches': '控制开关', 'Control Variables': '控制变量', 'Conditional Branch': '条件分支', 'Transfer Player': '玩家移动', 'Wait': '等待', 'Script': '脚本', 'Plugin Command': '插件指令'
    },
    ru: {
        'Name': 'Имя', 'Name:': 'Имя:', 'Description': 'Описание', 'Description:': 'Описание:', 'Icon': 'Иконка', 'Icon:': 'Иконка:', 'Price': 'Цена', 'Price:': 'Цена:', 'Type': 'Тип', 'Type:': 'Тип:', 'Scope': 'Область', 'Scope:': 'Область:', 'Occasion': 'Случай', 'Occasion:': 'Случай:', 'Speed': 'Скорость', 'Speed:': 'Скорость:', 'Success Rate': 'Шанс Успеха', 'Success Rate:': 'Шанс Успеха:', 'Repeats': 'Повторы', 'Repeats:': 'Повторы:', 'Hit Type': 'Тип Попадания', 'Hit Type:': 'Тип Попадания:', 'Animation ID': 'ID Анимации', 'Animation ID:': 'ID Анимации:', 'Damage': 'Урон', 'Effects': 'Эффекты', 'Traits': 'Черты', 'Note': 'Заметка', 'Add': 'Добавить', 'Edit': 'Изменить', 'Browse': 'Обзор', 'Fixed': 'Фиксировано', 'Constant': 'Константа', 'Increase': 'Увеличить', 'Decrease': 'Уменьшить', 'Actor': 'Актёр', 'Actor:': 'Актёр:', 'Enemy': 'Враг', 'Enemy:': 'Враг:', 'Skill': 'Навык', 'Skill:': 'Навык:', 'Target': 'Цель', 'Target:': 'Цель:', 'Duration:': 'Длительность:', 'seconds': 'секунд', 'Start': 'Старт', 'Picture #:': 'Картинка №:', 'Origin:': 'Источник:', 'Blend Mode:': 'Режим Смешивания:', 'Enter picture filename': 'Введите имя файла картинки', 'Edit Trait': 'Изменить Черту', 'Edit Effect': 'Изменить Эффект', 'System data not loaded': 'Системные данные не загружены', 'Show Text': 'Показать Текст', 'Show Choices': 'Показать Выбор', 'Control Switches': 'Управление Переключателями', 'Control Variables': 'Управление Переменными', 'Conditional Branch': 'Условная Ветвь', 'Transfer Player': 'Переместить Игрока', 'Wait': 'Ожидание', 'Script': 'Скрипт', 'Plugin Command': 'Команда Плагина'
    },
    pt: {
        'Name': 'Nome', 'Name:': 'Nome:', 'Description': 'Descrição', 'Description:': 'Descrição:', 'Icon': 'Ícone', 'Icon:': 'Ícone:', 'Price': 'Preço', 'Price:': 'Preço:', 'Type': 'Tipo', 'Type:': 'Tipo:', 'Scope': 'Escopo', 'Scope:': 'Escopo:', 'Occasion': 'Ocasião', 'Occasion:': 'Ocasião:', 'Speed': 'Velocidade', 'Speed:': 'Velocidade:', 'Success Rate': 'Taxa De Sucesso', 'Success Rate:': 'Taxa De Sucesso:', 'Repeats': 'Repetições', 'Repeats:': 'Repetições:', 'Hit Type': 'Tipo De Acerto', 'Hit Type:': 'Tipo De Acerto:', 'Animation ID': 'ID Da Animação', 'Animation ID:': 'ID Da Animação:', 'Damage': 'Dano', 'Effects': 'Efeitos', 'Traits': 'Traços', 'Note': 'Nota', 'Add': 'Adicionar', 'Edit': 'Editar', 'Browse': 'Procurar', 'Fixed': 'Fixo', 'Constant': 'Constante', 'Increase': 'Aumentar', 'Decrease': 'Diminuir', 'Actor': 'Ator', 'Actor:': 'Ator:', 'Enemy': 'Inimigo', 'Enemy:': 'Inimigo:', 'Skill': 'Habilidade', 'Skill:': 'Habilidade:', 'Target': 'Alvo', 'Target:': 'Alvo:', 'Duration:': 'Duração:', 'seconds': 'segundos', 'Start': 'Iniciar', 'Picture #:': 'Imagem Nº:', 'Origin:': 'Origem:', 'Blend Mode:': 'Modo De Mesclagem:', 'Enter picture filename': 'Digite o nome do arquivo de imagem', 'Edit Trait': 'Editar Traço', 'Edit Effect': 'Editar Efeito', 'System data not loaded': 'Dados do sistema não carregados', 'Show Text': 'Mostrar Texto', 'Show Choices': 'Mostrar Escolhas', 'Control Switches': 'Controlar Interruptores', 'Control Variables': 'Controlar Variáveis', 'Conditional Branch': 'Ramo Condicional', 'Transfer Player': 'Transferir Jogador', 'Wait': 'Esperar', 'Script': 'Script', 'Plugin Command': 'Comando De Plugin'
    },
    de: {},
    fr: {},
    el: {}
};

Object.assign(RR_TEXT_TRANSLATIONS.ja, {
    'Armor Type:': '防具タイプ:', 'Equip Type:': '装備タイプ:', 'Item Type': 'アイテムタイプ', 'Item Type:': 'アイテムタイプ:', 'Consumable': '消耗品', 'Element:': '属性:', 'Formula:': '計算式:', 'Variance:': '分散度:', 'Critical:': '会心:', 'Nickname:': '二つ名:', 'Class:': '職業:', 'Initial Level:': '初期レベル:', 'Max Level:': '最大レベル:', 'Profile:': 'プロフィール:', 'Battler Image:': 'バトラー画像:', 'Battler Hue:': 'バトラー色相:', 'EXP:': '経験値:', 'Gold:': 'ゴールド:', 'Kind:': '種類:', 'Condition Type:': '条件タイプ:', 'Param 1:': 'パラメータ 1:', 'Param 2:': 'パラメータ 2:', 'Rating (1-10):': 'レーティング (1-10):', 'Currency Unit:': '通貨単位:', 'Window Tone:': 'ウィンドウトーン:', 'Title Image:': 'タイトル画像:', 'Background:': '背景:', 'Offset X:': 'オフセット X:', 'Offset Y:': 'オフセット Y:', 'Volume:': '音量:', 'Pitch:': 'ピッチ:', 'Pan:': 'パン:', 'Select Platform(s)': 'プラットフォームを選択', 'NW.js Runtime': 'NW.js ランタイム', 'Output Directory': '出力フォルダー', 'Build Log': 'ビルドログ', 'Find Event': 'イベント検索', 'Search by name or ID:': '名前またはIDで検索:', 'Select Animation': 'アニメーションを選択'
});
Object.assign(RR_TEXT_TRANSLATIONS.es, {
    'Armor Type:': 'Tipo de armadura:', 'Equip Type:': 'Tipo de equipo:', 'Item Type': 'Tipo de objeto', 'Item Type:': 'Tipo de objeto:', 'Consumable': 'Consumible', 'Element:': 'Elemento:', 'Formula:': 'Fórmula:', 'Variance:': 'Variación:', 'Critical:': 'Crítico:', 'Nickname:': 'Apodo:', 'Class:': 'Clase:', 'Initial Level:': 'Nivel inicial:', 'Max Level:': 'Nivel máximo:', 'Profile:': 'Perfil:', 'Battler Image:': 'Imagen de batalla:', 'Battler Hue:': 'Tono de batalla:', 'EXP:': 'EXP:', 'Gold:': 'Oro:', 'Kind:': 'Tipo:', 'Condition Type:': 'Tipo de condición:', 'Param 1:': 'Parámetro 1:', 'Param 2:': 'Parámetro 2:', 'Rating (1-10):': 'Prioridad (1-10):', 'Currency Unit:': 'Unidad monetaria:', 'Window Tone:': 'Tono de ventana:', 'Title Image:': 'Imagen de título:', 'Background:': 'Fondo:', 'Offset X:': 'Desplazamiento X:', 'Offset Y:': 'Desplazamiento Y:', 'Volume:': 'Volumen:', 'Pitch:': 'Tono:', 'Pan:': 'Paneo:', 'Select Platform(s)': 'Seleccionar plataformas', 'NW.js Runtime': 'Runtime de NW.js', 'Output Directory': 'Directorio de salida', 'Build Log': 'Registro de compilación', 'Find Event': 'Buscar evento', 'Search by name or ID:': 'Buscar por nombre o ID:', 'Select Animation': 'Seleccionar animación'
});
Object.assign(RR_TEXT_TRANSLATIONS['zh-Hant'], {
    'Armor Type:': '防具類型:', 'Equip Type:': '裝備類型:', 'Item Type': '物品類型', 'Item Type:': '物品類型:', 'Consumable': '消耗品', 'Element:': '屬性:', 'Formula:': '公式:', 'Variance:': '分散度:', 'Critical:': '會心:', 'Nickname:': '暱稱:', 'Class:': '職業:', 'Initial Level:': '初始等級:', 'Max Level:': '最高等級:', 'Profile:': '簡介:', 'Battler Image:': '戰鬥圖像:', 'Battler Hue:': '戰鬥色相:', 'EXP:': '經驗值:', 'Gold:': '金錢:', 'Kind:': '種類:', 'Condition Type:': '條件類型:', 'Param 1:': '參數 1:', 'Param 2:': '參數 2:', 'Rating (1-10):': '評級 (1-10):', 'Currency Unit:': '貨幣單位:', 'Window Tone:': '視窗色調:', 'Title Image:': '標題圖片:', 'Background:': '背景:', 'Offset X:': '偏移 X:', 'Offset Y:': '偏移 Y:', 'Volume:': '音量:', 'Pitch:': '音高:', 'Pan:': '聲像:', 'Select Platform(s)': '選擇平台', 'NW.js Runtime': 'NW.js 執行環境', 'Output Directory': '輸出資料夾', 'Build Log': '建置記錄', 'Find Event': '尋找事件', 'Search by name or ID:': '依名稱或 ID 搜尋:', 'Select Animation': '選擇動畫'
});
Object.assign(RR_TEXT_TRANSLATIONS['zh-Hans'], {
    'Armor Type:': '防具类型:', 'Equip Type:': '装备类型:', 'Item Type': '物品类型', 'Item Type:': '物品类型:', 'Consumable': '消耗品', 'Element:': '属性:', 'Formula:': '公式:', 'Variance:': '分散度:', 'Critical:': '会心:', 'Nickname:': '昵称:', 'Class:': '职业:', 'Initial Level:': '初始等级:', 'Max Level:': '最高等级:', 'Profile:': '简介:', 'Battler Image:': '战斗图像:', 'Battler Hue:': '战斗色相:', 'EXP:': '经验值:', 'Gold:': '金钱:', 'Kind:': '种类:', 'Condition Type:': '条件类型:', 'Param 1:': '参数 1:', 'Param 2:': '参数 2:', 'Rating (1-10):': '评级 (1-10):', 'Currency Unit:': '货币单位:', 'Window Tone:': '窗口色调:', 'Title Image:': '标题图片:', 'Background:': '背景:', 'Offset X:': '偏移 X:', 'Offset Y:': '偏移 Y:', 'Volume:': '音量:', 'Pitch:': '音高:', 'Pan:': '声像:', 'Select Platform(s)': '选择平台', 'NW.js Runtime': 'NW.js 运行环境', 'Output Directory': '输出文件夹', 'Build Log': '构建日志', 'Find Event': '查找事件', 'Search by name or ID:': '按名称或 ID 搜索:', 'Select Animation': '选择动画'
});
Object.assign(RR_TEXT_TRANSLATIONS.ru, {
    'Armor Type:': 'Тип Брони:', 'Equip Type:': 'Тип Экипировки:', 'Item Type': 'Тип Предмета', 'Item Type:': 'Тип Предмета:', 'Consumable': 'Расходуемый', 'Element:': 'Элемент:', 'Formula:': 'Формула:', 'Variance:': 'Разброс:', 'Critical:': 'Крит:', 'Nickname:': 'Прозвище:', 'Class:': 'Класс:', 'Initial Level:': 'Начальный Уровень:', 'Max Level:': 'Макс. Уровень:', 'Profile:': 'Профиль:', 'Battler Image:': 'Изображение Бойца:', 'Battler Hue:': 'Оттенок Бойца:', 'EXP:': 'Опыт:', 'Gold:': 'Золото:', 'Kind:': 'Вид:', 'Condition Type:': 'Тип Условия:', 'Param 1:': 'Параметр 1:', 'Param 2:': 'Параметр 2:', 'Rating (1-10):': 'Рейтинг (1-10):', 'Currency Unit:': 'Валюта:', 'Window Tone:': 'Тон Окна:', 'Title Image:': 'Изображение Заголовка:', 'Background:': 'Фон:', 'Offset X:': 'Смещение X:', 'Offset Y:': 'Смещение Y:', 'Volume:': 'Громкость:', 'Pitch:': 'Тон:', 'Pan:': 'Панорама:', 'Select Platform(s)': 'Выбор Платформ', 'NW.js Runtime': 'Среда NW.js', 'Output Directory': 'Папка Вывода', 'Build Log': 'Журнал Сборки', 'Find Event': 'Найти Событие', 'Search by name or ID:': 'Поиск по имени или ID:', 'Select Animation': 'Выбрать Анимацию'
});
Object.assign(RR_TEXT_TRANSLATIONS.pt, {
    'Armor Type:': 'Tipo De Armadura:', 'Equip Type:': 'Tipo De Equipamento:', 'Item Type': 'Tipo De Item', 'Item Type:': 'Tipo De Item:', 'Consumable': 'Consumível', 'Element:': 'Elemento:', 'Formula:': 'Fórmula:', 'Variance:': 'Variação:', 'Critical:': 'Crítico:', 'Nickname:': 'Apelido:', 'Class:': 'Classe:', 'Initial Level:': 'Nível Inicial:', 'Max Level:': 'Nível Máximo:', 'Profile:': 'Perfil:', 'Battler Image:': 'Imagem De Batalha:', 'Battler Hue:': 'Matiz De Batalha:', 'EXP:': 'EXP:', 'Gold:': 'Ouro:', 'Kind:': 'Tipo:', 'Condition Type:': 'Tipo De Condição:', 'Param 1:': 'Parâmetro 1:', 'Param 2:': 'Parâmetro 2:', 'Rating (1-10):': 'Avaliação (1-10):', 'Currency Unit:': 'Unidade Monetária:', 'Window Tone:': 'Tom Da Janela:', 'Title Image:': 'Imagem Do Título:', 'Background:': 'Fundo:', 'Offset X:': 'Deslocamento X:', 'Offset Y:': 'Deslocamento Y:', 'Volume:': 'Volume:', 'Pitch:': 'Tom:', 'Pan:': 'Pan:', 'Select Platform(s)': 'Selecionar Plataformas', 'NW.js Runtime': 'Runtime NW.js', 'Output Directory': 'Diretório De Saída', 'Build Log': 'Log De Compilação', 'Find Event': 'Encontrar Evento', 'Search by name or ID:': 'Buscar por nome ou ID:', 'Select Animation': 'Selecionar Animação'
});

Object.assign(RR_TEXT_TRANSLATIONS.ja, {
    'General': '全般', 'Invocation': '発動', 'Parameters': '能力値', 'Parameter': '能力値', 'Value': '値', 'Content': '内容', 'Message': 'メッセージ', 'Effect': '効果', 'No traits': '特徴なし', 'No effects': '効果なし', 'Skill Type:': 'スキルタイプ:', 'MP Cost:': 'MP消費:', 'TP Cost:': 'TP消費:', 'TP Gain:': 'TP獲得:', 'Message 1:': 'メッセージ 1:', 'Message 2:': 'メッセージ 2:', 'Message 3:': 'メッセージ 3:', 'Message 4:': 'メッセージ 4:', 'Recovery': '回復', 'State': 'ステート', 'Buff': '強化', 'Special': '特殊', 'HP Recovery': 'HP回復', 'MP Recovery': 'MP回復', 'Add State': 'ステート付加', 'Remove State': 'ステート解除', 'Add Buff': '強化付加', 'Add Debuff': '弱体付加', 'Remove Buff': '強化解除', 'Remove Debuff': '弱体解除', 'Special Effect': '特殊効果', 'Grow': '成長', 'Learn Skill': 'スキル習得', 'Common Event': 'コモンイベント', 'Escape': '逃走', 'turns': 'ターン', 'Regular Item': '通常アイテム', 'Key Item': '大事なもの', 'Item is removed from inventory after use': '使用後に所持品から削除されます', 'None': 'なし', 'One Enemy': '敵単体', 'All Enemies': '敵全体', '3 Random': '敵ランダム3体', '4 Random': '敵ランダム4体', '2 Random': '敵ランダム2体', '1 Random': '敵ランダム1体', 'One Ally': '味方単体', 'All Allies': '味方全体', 'One Ally (Dead)': '味方単体（戦闘不能）', 'All Allies (Dead)': '味方全体（戦闘不能）', 'User': '使用者', 'Always': '常時', 'Battle Only': '戦闘時のみ', 'Menu Only': 'メニュー時のみ', 'Never': '使用不可', 'Certain': '必中', 'Physical': '物理攻撃', 'Magical': '魔法攻撃', 'HP Damage': 'HPダメージ', 'MP Damage': 'MPダメージ', 'HP Recover': 'HP回復', 'MP Recover': 'MP回復', 'HP Drain': 'HP吸収', 'MP Drain': 'MP吸収', 'Normal Attack': '通常攻撃', 'Max HP': '最大HP', 'Max MP': '最大MP', 'Attack': '攻撃力', 'Defense': '防御力', 'M.Attack': '魔法力', 'M.Defense': '魔法防御', 'Agility': '敏捷性', 'Luck': '運'
});
Object.assign(RR_TEXT_TRANSLATIONS.es, {
    'General': 'General', 'Invocation': 'Invocación', 'Parameters': 'Parámetros', 'Parameter': 'Parámetro', 'Value': 'Valor', 'Content': 'Contenido', 'Message': 'Mensaje', 'Effect': 'Efecto', 'No traits': 'Sin rasgos', 'No effects': 'Sin efectos', 'Skill Type:': 'Tipo de habilidad:', 'MP Cost:': 'Coste de MP:', 'TP Cost:': 'Coste de TP:', 'TP Gain:': 'Ganancia de TP:', 'Message 1:': 'Mensaje 1:', 'Message 2:': 'Mensaje 2:', 'Message 3:': 'Mensaje 3:', 'Message 4:': 'Mensaje 4:', 'Recovery': 'Recuperación', 'State': 'Estado', 'Buff': 'Mejora', 'Special': 'Especial', 'HP Recovery': 'Recuperar HP', 'MP Recovery': 'Recuperar MP', 'Add State': 'Añadir estado', 'Remove State': 'Quitar estado', 'Add Buff': 'Añadir mejora', 'Add Debuff': 'Añadir penalización', 'Remove Buff': 'Quitar mejora', 'Remove Debuff': 'Quitar penalización', 'Special Effect': 'Efecto especial', 'Grow': 'Crecer', 'Learn Skill': 'Aprender habilidad', 'Common Event': 'Evento común', 'Escape': 'Escapar', 'turns': 'turnos', 'Regular Item': 'Objeto normal', 'Key Item': 'Objeto clave', 'Item is removed from inventory after use': 'El objeto se elimina del inventario tras usarlo', 'None': 'Ninguno', 'One Enemy': 'Un enemigo', 'All Enemies': 'Todos los enemigos', '3 Random': '3 aleatorios', '4 Random': '4 aleatorios', '2 Random': '2 aleatorios', '1 Random': '1 aleatorio', 'One Ally': 'Un aliado', 'All Allies': 'Todos los aliados', 'One Ally (Dead)': 'Un aliado (muerto)', 'All Allies (Dead)': 'Todos los aliados (muertos)', 'User': 'Usuario', 'Always': 'Siempre', 'Battle Only': 'Solo batalla', 'Menu Only': 'Solo menú', 'Never': 'Nunca', 'Certain': 'Seguro', 'Physical': 'Físico', 'Magical': 'Mágico', 'HP Damage': 'Daño HP', 'MP Damage': 'Daño MP', 'HP Recover': 'Recuperar HP', 'MP Recover': 'Recuperar MP', 'HP Drain': 'Drenar HP', 'MP Drain': 'Drenar MP', 'Normal Attack': 'Ataque normal', 'Max HP': 'HP máx.', 'Max MP': 'MP máx.', 'Attack': 'Ataque', 'Defense': 'Defensa', 'M.Attack': 'Ataque M.', 'M.Defense': 'Defensa M.', 'Agility': 'Agilidad', 'Luck': 'Suerte'
});
Object.assign(RR_TEXT_TRANSLATIONS['zh-Hant'], {
    'General': '一般', 'Invocation': '調用', 'Parameters': '參數', 'Parameter': '參數', 'Value': '值', 'Content': '內容', 'Message': '訊息', 'Effect': '效果', 'No traits': '無特性', 'No effects': '無效果', 'Skill Type:': '技能類型:', 'MP Cost:': 'MP 消耗:', 'TP Cost:': 'TP 消耗:', 'TP Gain:': 'TP 獲得:', 'Message 1:': '訊息 1:', 'Message 2:': '訊息 2:', 'Message 3:': '訊息 3:', 'Message 4:': '訊息 4:', 'Recovery': '恢復', 'State': '狀態', 'Buff': '強化', 'Special': '特殊', 'HP Recovery': 'HP 恢復', 'MP Recovery': 'MP 恢復', 'Add State': '附加狀態', 'Remove State': '移除狀態', 'Add Buff': '附加強化', 'Add Debuff': '附加弱化', 'Remove Buff': '移除強化', 'Remove Debuff': '移除弱化', 'Special Effect': '特殊效果', 'Grow': '成長', 'Learn Skill': '學習技能', 'Common Event': '共通事件', 'Escape': '逃跑', 'turns': '回合', 'Regular Item': '一般物品', 'Key Item': '重要物品', 'Item is removed from inventory after use': '使用後會從庫存中移除', 'None': '無', 'One Enemy': '單一敵人', 'All Enemies': '所有敵人', '3 Random': '隨機 3 個', '4 Random': '隨機 4 個', '2 Random': '隨機 2 個', '1 Random': '隨機 1 個', 'One Ally': '單一盟友', 'All Allies': '所有盟友', 'One Ally (Dead)': '單一盟友（死亡）', 'All Allies (Dead)': '所有盟友（死亡）', 'User': '使用者', 'Always': '總是', 'Battle Only': '僅戰鬥', 'Menu Only': '僅選單', 'Never': '永不', 'Certain': '必中', 'Physical': '物理', 'Magical': '魔法', 'HP Damage': 'HP 傷害', 'MP Damage': 'MP 傷害', 'HP Recover': 'HP 恢復', 'MP Recover': 'MP 恢復', 'HP Drain': 'HP 吸收', 'MP Drain': 'MP 吸收', 'Normal Attack': '普通攻擊', 'Max HP': '最大 HP', 'Max MP': '最大 MP', 'Attack': '攻擊', 'Defense': '防禦', 'M.Attack': '魔法攻擊', 'M.Defense': '魔法防禦', 'Agility': '敏捷', 'Luck': '幸運'
});
Object.assign(RR_TEXT_TRANSLATIONS['zh-Hans'], {
    'General': '一般', 'Invocation': '调用', 'Parameters': '参数', 'Parameter': '参数', 'Value': '值', 'Content': '内容', 'Message': '消息', 'Effect': '效果', 'No traits': '无特性', 'No effects': '无效果', 'Skill Type:': '技能类型:', 'MP Cost:': 'MP 消耗:', 'TP Cost:': 'TP 消耗:', 'TP Gain:': 'TP 获得:', 'Message 1:': '消息 1:', 'Message 2:': '消息 2:', 'Message 3:': '消息 3:', 'Message 4:': '消息 4:', 'Recovery': '恢复', 'State': '状态', 'Buff': '强化', 'Special': '特殊', 'HP Recovery': 'HP 恢复', 'MP Recovery': 'MP 恢复', 'Add State': '附加状态', 'Remove State': '移除状态', 'Add Buff': '附加强化', 'Add Debuff': '附加弱化', 'Remove Buff': '移除强化', 'Remove Debuff': '移除弱化', 'Special Effect': '特殊效果', 'Grow': '成长', 'Learn Skill': '学习技能', 'Common Event': '公共事件', 'Escape': '逃跑', 'turns': '回合', 'Regular Item': '普通物品', 'Key Item': '重要物品', 'Item is removed from inventory after use': '使用后会从库存中移除', 'None': '无', 'One Enemy': '单个敌人', 'All Enemies': '所有敌人', '3 Random': '随机 3 个', '4 Random': '随机 4 个', '2 Random': '随机 2 个', '1 Random': '随机 1 个', 'One Ally': '单个盟友', 'All Allies': '所有盟友', 'One Ally (Dead)': '单个盟友（死亡）', 'All Allies (Dead)': '所有盟友（死亡）', 'User': '使用者', 'Always': '总是', 'Battle Only': '仅战斗', 'Menu Only': '仅菜单', 'Never': '永不', 'Certain': '必中', 'Physical': '物理', 'Magical': '魔法', 'HP Damage': 'HP 伤害', 'MP Damage': 'MP 伤害', 'HP Recover': 'HP 恢复', 'MP Recover': 'MP 恢复', 'HP Drain': 'HP 吸收', 'MP Drain': 'MP 吸收', 'Normal Attack': '普通攻击', 'Max HP': '最大 HP', 'Max MP': '最大 MP', 'Attack': '攻击', 'Defense': '防御', 'M.Attack': '魔法攻击', 'M.Defense': '魔法防御', 'Agility': '敏捷', 'Luck': '幸运'
});
Object.assign(RR_TEXT_TRANSLATIONS.ru, {
    'General': 'Общее', 'Invocation': 'Применение', 'Parameters': 'Параметры', 'Parameter': 'Параметр', 'Value': 'Значение', 'Content': 'Содержимое', 'Message': 'Сообщение', 'Effect': 'Эффект', 'No traits': 'Нет черт', 'No effects': 'Нет эффектов', 'Skill Type:': 'Тип Навыка:', 'MP Cost:': 'Стоимость MP:', 'TP Cost:': 'Стоимость TP:', 'TP Gain:': 'Получение TP:', 'Message 1:': 'Сообщение 1:', 'Message 2:': 'Сообщение 2:', 'Message 3:': 'Сообщение 3:', 'Message 4:': 'Сообщение 4:', 'Recovery': 'Восстановление', 'State': 'Состояние', 'Buff': 'Усиление', 'Special': 'Особое', 'HP Recovery': 'Восстановление HP', 'MP Recovery': 'Восстановление MP', 'Add State': 'Добавить Состояние', 'Remove State': 'Убрать Состояние', 'Add Buff': 'Добавить Усиление', 'Add Debuff': 'Добавить Ослабление', 'Remove Buff': 'Убрать Усиление', 'Remove Debuff': 'Убрать Ослабление', 'Special Effect': 'Особый Эффект', 'Grow': 'Рост', 'Learn Skill': 'Выучить Навык', 'Common Event': 'Общее Событие', 'Escape': 'Побег', 'turns': 'ходов', 'Regular Item': 'Обычный Предмет', 'Key Item': 'Ключевой Предмет', 'Item is removed from inventory after use': 'Предмет удаляется из инвентаря после использования', 'None': 'Нет', 'One Enemy': 'Один Враг', 'All Enemies': 'Все Враги', '3 Random': '3 Случайных', '4 Random': '4 Случайных', '2 Random': '2 Случайных', '1 Random': '1 Случайный', 'One Ally': 'Один Союзник', 'All Allies': 'Все Союзники', 'One Ally (Dead)': 'Один Союзник (Мёртв)', 'All Allies (Dead)': 'Все Союзники (Мертвы)', 'User': 'Пользователь', 'Always': 'Всегда', 'Battle Only': 'Только Бой', 'Menu Only': 'Только Меню', 'Never': 'Никогда', 'Certain': 'Точно', 'Physical': 'Физический', 'Magical': 'Магический', 'HP Damage': 'Урон HP', 'MP Damage': 'Урон MP', 'HP Recover': 'Восст. HP', 'MP Recover': 'Восст. MP', 'HP Drain': 'Поглощение HP', 'MP Drain': 'Поглощение MP', 'Normal Attack': 'Обычная Атака', 'Max HP': 'Макс. HP', 'Max MP': 'Макс. MP', 'Attack': 'Атака', 'Defense': 'Защита', 'M.Attack': 'Маг. Атака', 'M.Defense': 'Маг. Защита', 'Agility': 'Ловкость', 'Luck': 'Удача'
});
Object.assign(RR_TEXT_TRANSLATIONS.pt, {
    'General': 'Geral', 'Invocation': 'Invocação', 'Parameters': 'Parâmetros', 'Parameter': 'Parâmetro', 'Value': 'Valor', 'Content': 'Conteúdo', 'Message': 'Mensagem', 'Effect': 'Efeito', 'No traits': 'Sem traços', 'No effects': 'Sem efeitos', 'Skill Type:': 'Tipo De Habilidade:', 'MP Cost:': 'Custo De MP:', 'TP Cost:': 'Custo De TP:', 'TP Gain:': 'Ganho De TP:', 'Message 1:': 'Mensagem 1:', 'Message 2:': 'Mensagem 2:', 'Message 3:': 'Mensagem 3:', 'Message 4:': 'Mensagem 4:', 'Recovery': 'Recuperação', 'State': 'Estado', 'Buff': 'Bônus', 'Special': 'Especial', 'HP Recovery': 'Recuperação De HP', 'MP Recovery': 'Recuperação De MP', 'Add State': 'Adicionar Estado', 'Remove State': 'Remover Estado', 'Add Buff': 'Adicionar Bônus', 'Add Debuff': 'Adicionar Penalidade', 'Remove Buff': 'Remover Bônus', 'Remove Debuff': 'Remover Penalidade', 'Special Effect': 'Efeito Especial', 'Grow': 'Crescer', 'Learn Skill': 'Aprender Habilidade', 'Common Event': 'Evento Comum', 'Escape': 'Fugir', 'turns': 'turnos', 'Regular Item': 'Item Normal', 'Key Item': 'Item-Chave', 'Item is removed from inventory after use': 'O item é removido do inventário após o uso', 'None': 'Nenhum', 'One Enemy': 'Um Inimigo', 'All Enemies': 'Todos Os Inimigos', '3 Random': '3 Aleatórios', '4 Random': '4 Aleatórios', '2 Random': '2 Aleatórios', '1 Random': '1 Aleatório', 'One Ally': 'Um Aliado', 'All Allies': 'Todos Os Aliados', 'One Ally (Dead)': 'Um Aliado (Morto)', 'All Allies (Dead)': 'Todos Os Aliados (Mortos)', 'User': 'Usuário', 'Always': 'Sempre', 'Battle Only': 'Só Em Batalha', 'Menu Only': 'Só No Menu', 'Never': 'Nunca', 'Certain': 'Certo', 'Physical': 'Físico', 'Magical': 'Mágico', 'HP Damage': 'Dano De HP', 'MP Damage': 'Dano De MP', 'HP Recover': 'Recuperar HP', 'MP Recover': 'Recuperar MP', 'HP Drain': 'Drenar HP', 'MP Drain': 'Drenar MP', 'Normal Attack': 'Ataque Normal', 'Max HP': 'HP Máx.', 'Max MP': 'MP Máx.', 'Attack': 'Ataque', 'Defense': 'Defesa', 'M.Attack': 'Ataque M.', 'M.Defense': 'Defesa M.', 'Agility': 'Agilidade', 'Luck': 'Sorte'
});

Object.assign(RR_TEXT_TRANSLATIONS.ja, { 'Images': '画像', 'General Settings': '基本設定', 'Equipment': '装備', 'Slot': 'スロット', 'No equipment slots available': '利用可能な装備スロットがありません', 'Weapon Type:': '武器タイプ:', 'EXP Curve:': '経験値曲線:', 'Basis:': '基本値:', 'Extra:': '補正値:', 'Accel A:': '加速 A:', 'Accel B:': '加速 B:', 'Parameter Curves': '能力値曲線', 'Duration': '継続時間', 'Messages': 'メッセージ', 'Priority:': '優先度:', 'Restriction:': '制約:', 'Auto-Remove:': '自動解除:', 'Min Turns:': '最小ターン:', 'Max Turns:': '最大ターン:', 'Remove by Damage:': 'ダメージで解除:', 'Chance by Damage:': 'ダメージ解除率:', 'Remove at Battle End:': '戦闘終了時に解除:', 'Remove by Walking:': '歩行で解除:', 'Steps to Remove:': '解除までの歩数:', 'Remove by Restriction:': '行動制約で解除:', 'Actor Afflicted:': 'アクター付加時:', 'Enemy Afflicted:': '敵付加時:', 'State Persists:': '継続時:', 'State Removed:': '解除時:', 'Attack Enemy': '敵を攻撃', 'Attack Anyone': '誰かを攻撃', 'Attack Ally': '味方を攻撃', 'Cannot Move': '行動不能', 'End of Action': '行動終了時', 'End of Turn': 'ターン終了時', 'Please select an effect type before saving.': '保存前に効果タイプを選択してください。' });
Object.assign(RR_TEXT_TRANSLATIONS.es, { 'Images': 'Imágenes', 'General Settings': 'Ajustes generales', 'Equipment': 'Equipo', 'Slot': 'Ranura', 'No equipment slots available': 'No hay ranuras de equipo disponibles', 'Weapon Type:': 'Tipo de arma:', 'EXP Curve:': 'Curva de EXP:', 'Basis:': 'Base:', 'Extra:': 'Extra:', 'Accel A:': 'Aceler. A:', 'Accel B:': 'Aceler. B:', 'Parameter Curves': 'Curvas de parámetros', 'Duration': 'Duración', 'Messages': 'Mensajes', 'Priority:': 'Prioridad:', 'Restriction:': 'Restricción:', 'Auto-Remove:': 'Autoeliminar:', 'Min Turns:': 'Turnos mín.:', 'Max Turns:': 'Turnos máx.:', 'Remove by Damage:': 'Quitar por daño:', 'Chance by Damage:': 'Prob. por daño:', 'Remove at Battle End:': 'Quitar al final de batalla:', 'Remove by Walking:': 'Quitar al caminar:', 'Steps to Remove:': 'Pasos para quitar:', 'Remove by Restriction:': 'Quitar por restricción:', 'Actor Afflicted:': 'Actor afectado:', 'Enemy Afflicted:': 'Enemigo afectado:', 'State Persists:': 'Estado persiste:', 'State Removed:': 'Estado quitado:', 'Attack Enemy': 'Atacar enemigo', 'Attack Anyone': 'Atacar a cualquiera', 'Attack Ally': 'Atacar aliado', 'Cannot Move': 'No puede moverse', 'End of Action': 'Fin de acción', 'End of Turn': 'Fin de turno', 'Please select an effect type before saving.': 'Selecciona un tipo de efecto antes de guardar.' });
Object.assign(RR_TEXT_TRANSLATIONS['zh-Hant'], { 'Images': '圖片', 'General Settings': '一般設定', 'Equipment': '裝備', 'Slot': '欄位', 'No equipment slots available': '沒有可用的裝備欄位', 'Weapon Type:': '武器類型:', 'EXP Curve:': '經驗曲線:', 'Basis:': '基礎:', 'Extra:': '額外:', 'Accel A:': '加速 A:', 'Accel B:': '加速 B:', 'Parameter Curves': '參數曲線', 'Duration': '持續時間', 'Messages': '訊息', 'Priority:': '優先度:', 'Restriction:': '限制:', 'Auto-Remove:': '自動解除:', 'Min Turns:': '最小回合:', 'Max Turns:': '最大回合:', 'Remove by Damage:': '受傷解除:', 'Chance by Damage:': '受傷解除率:', 'Remove at Battle End:': '戰鬥結束解除:', 'Remove by Walking:': '步行解除:', 'Steps to Remove:': '解除步數:', 'Remove by Restriction:': '限制解除:', 'Actor Afflicted:': '角色受影響:', 'Enemy Afflicted:': '敵人受影響:', 'State Persists:': '狀態持續:', 'State Removed:': '狀態解除:', 'Attack Enemy': '攻擊敵人', 'Attack Anyone': '攻擊任意對象', 'Attack Ally': '攻擊盟友', 'Cannot Move': '不能移動', 'End of Action': '行動結束', 'End of Turn': '回合結束', 'Please select an effect type before saving.': '儲存前請選擇效果類型。' });
Object.assign(RR_TEXT_TRANSLATIONS['zh-Hans'], { 'Images': '图片', 'General Settings': '一般设置', 'Equipment': '装备', 'Slot': '栏位', 'No equipment slots available': '没有可用的装备栏位', 'Weapon Type:': '武器类型:', 'EXP Curve:': '经验曲线:', 'Basis:': '基础:', 'Extra:': '额外:', 'Accel A:': '加速 A:', 'Accel B:': '加速 B:', 'Parameter Curves': '参数曲线', 'Duration': '持续时间', 'Messages': '消息', 'Priority:': '优先级:', 'Restriction:': '限制:', 'Auto-Remove:': '自动解除:', 'Min Turns:': '最小回合:', 'Max Turns:': '最大回合:', 'Remove by Damage:': '受伤解除:', 'Chance by Damage:': '受伤解除率:', 'Remove at Battle End:': '战斗结束解除:', 'Remove by Walking:': '步行解除:', 'Steps to Remove:': '解除步数:', 'Remove by Restriction:': '限制解除:', 'Actor Afflicted:': '角色受影响:', 'Enemy Afflicted:': '敌人受影响:', 'State Persists:': '状态持续:', 'State Removed:': '状态解除:', 'Attack Enemy': '攻击敌人', 'Attack Anyone': '攻击任意对象', 'Attack Ally': '攻击盟友', 'Cannot Move': '不能移动', 'End of Action': '行动结束', 'End of Turn': '回合结束', 'Please select an effect type before saving.': '保存前请选择效果类型。' });
Object.assign(RR_TEXT_TRANSLATIONS.ru, { 'Images': 'Изображения', 'General Settings': 'Общие Настройки', 'Equipment': 'Экипировка', 'Slot': 'Слот', 'No equipment slots available': 'Нет доступных слотов экипировки', 'Weapon Type:': 'Тип Оружия:', 'EXP Curve:': 'Кривая Опыта:', 'Basis:': 'База:', 'Extra:': 'Доп.:', 'Accel A:': 'Ускор. A:', 'Accel B:': 'Ускор. B:', 'Parameter Curves': 'Кривые Параметров', 'Duration': 'Длительность', 'Messages': 'Сообщения', 'Priority:': 'Приоритет:', 'Restriction:': 'Ограничение:', 'Auto-Remove:': 'Авто-Удаление:', 'Min Turns:': 'Мин. Ходов:', 'Max Turns:': 'Макс. Ходов:', 'Remove by Damage:': 'Удалять От Урона:', 'Chance by Damage:': 'Шанс От Урона:', 'Remove at Battle End:': 'Удалять В Конце Боя:', 'Remove by Walking:': 'Удалять При Ходьбе:', 'Steps to Remove:': 'Шагов До Удаления:', 'Remove by Restriction:': 'Удалять По Ограничению:', 'Actor Afflicted:': 'Актёр Поражён:', 'Enemy Afflicted:': 'Враг Поражён:', 'State Persists:': 'Состояние Продолжается:', 'State Removed:': 'Состояние Удалено:', 'Attack Enemy': 'Атаковать Врага', 'Attack Anyone': 'Атаковать Любого', 'Attack Ally': 'Атаковать Союзника', 'Cannot Move': 'Не Может Двигаться', 'End of Action': 'Конец Действия', 'End of Turn': 'Конец Хода', 'Please select an effect type before saving.': 'Выберите тип эффекта перед сохранением.' });
Object.assign(RR_TEXT_TRANSLATIONS.pt, { 'Images': 'Imagens', 'General Settings': 'Configurações Gerais', 'Equipment': 'Equipamento', 'Slot': 'Espaço', 'No equipment slots available': 'Nenhum espaço de equipamento disponível', 'Weapon Type:': 'Tipo De Arma:', 'EXP Curve:': 'Curva De EXP:', 'Basis:': 'Base:', 'Extra:': 'Extra:', 'Accel A:': 'Acel. A:', 'Accel B:': 'Acel. B:', 'Parameter Curves': 'Curvas De Parâmetros', 'Duration': 'Duração', 'Messages': 'Mensagens', 'Priority:': 'Prioridade:', 'Restriction:': 'Restrição:', 'Auto-Remove:': 'Remoção Automática:', 'Min Turns:': 'Turnos Mín.:', 'Max Turns:': 'Turnos Máx.:', 'Remove by Damage:': 'Remover Por Dano:', 'Chance by Damage:': 'Chance Por Dano:', 'Remove at Battle End:': 'Remover No Fim Da Batalha:', 'Remove by Walking:': 'Remover Ao Andar:', 'Steps to Remove:': 'Passos Para Remover:', 'Remove by Restriction:': 'Remover Por Restrição:', 'Actor Afflicted:': 'Ator Afetado:', 'Enemy Afflicted:': 'Inimigo Afetado:', 'State Persists:': 'Estado Persiste:', 'State Removed:': 'Estado Removido:', 'Attack Enemy': 'Atacar Inimigo', 'Attack Anyone': 'Atacar Qualquer Um', 'Attack Ally': 'Atacar Aliado', 'Cannot Move': 'Não Pode Mover', 'End of Action': 'Fim Da Ação', 'End of Turn': 'Fim Do Turno', 'Please select an effect type before saving.': 'Selecione um tipo de efeito antes de salvar.' });

Object.assign(RR_TEXT_TRANSLATIONS.ja, { 'Rates': '率', 'Param': '能力値', 'Equip': '装備', 'Other': 'その他', 'Element Rate': '属性有効度', 'Debuff Rate': '弱体有効度', 'State Rate': 'ステート有効度', 'State Resist': 'ステート無効化', 'Ex-Parameter': '追加能力値', 'Sp-Parameter': '特殊能力値', 'Hit Rate': '命中率', 'Evasion Rate': '回避率', 'Critical Rate': '会心率', 'Critical Evasion': '会心回避率', 'Magic Evasion': '魔法回避率', 'Magic Reflection': '魔法反射率', 'Counter Attack': '反撃率', 'HP Regeneration': 'HP再生率', 'MP Regeneration': 'MP再生率', 'TP Regeneration': 'TP再生率', 'Target Rate': '狙われ率', 'Guard Effect': '防御効果率', 'Recovery Effect': '回復効果率', 'Pharmacology': '薬の知識', 'MP Cost Rate': 'MP消費率', 'TP Charge Rate': 'TPチャージ率', 'Physical Damage': '物理ダメージ率', 'Magical Damage': '魔法ダメージ率', 'Floor Damage': '床ダメージ率', 'Experience': '経験獲得率', 'Attack Element': '攻撃時属性', 'Attack State': '攻撃時ステート', 'Attack Speed': '攻撃速度補正', 'Attack Times+': '攻撃追加回数', 'Attack Skill': '攻撃スキル', 'Add Skill Type': 'スキルタイプ追加', 'Seal Skill Type': 'スキルタイプ封印', 'Add Skill': 'スキル追加', 'Seal Skill': 'スキル封印', 'Equip Weapon': '武器装備', 'Equip Armor': '防具装備', 'Lock Equip': '装備固定', 'Seal Equip': '装備封印', 'Slot Type': 'スロットタイプ', 'Dual Wield': '二刀流', 'Action Times+': '行動追加回数', 'Special Flag': '特殊フラグ', 'Auto Battle': '自動戦闘', 'Guard': '防御', 'Substitute': '身代わり', 'Preserve TP': 'TP持ち越し', 'Collapse Effect': '消滅エフェクト', 'Boss': 'ボス', 'Instant': '瞬間', 'No Disappear': '消えない', 'Party Ability': 'パーティ能力', 'Encounter Half': 'エンカウント半減', 'Encounter None': 'エンカウント無効', 'Cancel Surprise': '不意打ち無効', 'Raise Preemptive': '先制率アップ', 'Gold Double': '獲得金額2倍', 'Drop Item Double': 'アイテム入手率2倍', 'Please select a trait type before saving.': '保存前に特徴タイプを選択してください。' });
Object.assign(RR_TEXT_TRANSLATIONS.es, { 'Rates': 'Tasas', 'Param': 'Parám.', 'Equip': 'Equipo', 'Other': 'Otros', 'Element Rate': 'Tasa de elemento', 'Debuff Rate': 'Tasa de penalización', 'State Rate': 'Tasa de estado', 'State Resist': 'Resistir estado', 'Ex-Parameter': 'Ex-parámetro', 'Sp-Parameter': 'Parámetro esp.', 'Hit Rate': 'Tasa de golpe', 'Evasion Rate': 'Evasión', 'Critical Rate': 'Crítico', 'Critical Evasion': 'Evasión crítica', 'Magic Evasion': 'Evasión mágica', 'Magic Reflection': 'Reflexión mágica', 'Counter Attack': 'Contraataque', 'HP Regeneration': 'Regeneración HP', 'MP Regeneration': 'Regeneración MP', 'TP Regeneration': 'Regeneración TP', 'Target Rate': 'Tasa de objetivo', 'Guard Effect': 'Efecto de guardia', 'Recovery Effect': 'Efecto de recuperación', 'Pharmacology': 'Farmacología', 'MP Cost Rate': 'Coste de MP', 'TP Charge Rate': 'Carga de TP', 'Physical Damage': 'Daño físico', 'Magical Damage': 'Daño mágico', 'Floor Damage': 'Daño de suelo', 'Experience': 'Experiencia', 'Attack Element': 'Elemento de ataque', 'Attack State': 'Estado de ataque', 'Attack Speed': 'Velocidad de ataque', 'Attack Times+': 'Ataques extra', 'Attack Skill': 'Habilidad de ataque', 'Add Skill Type': 'Añadir tipo de habilidad', 'Seal Skill Type': 'Sellar tipo de habilidad', 'Add Skill': 'Añadir habilidad', 'Seal Skill': 'Sellar habilidad', 'Equip Weapon': 'Equipar arma', 'Equip Armor': 'Equipar armadura', 'Lock Equip': 'Bloquear equipo', 'Seal Equip': 'Sellar equipo', 'Slot Type': 'Tipo de ranura', 'Dual Wield': 'Doble arma', 'Action Times+': 'Acciones extra', 'Special Flag': 'Marca especial', 'Auto Battle': 'Batalla automática', 'Guard': 'Guardia', 'Substitute': 'Sustituir', 'Preserve TP': 'Conservar TP', 'Collapse Effect': 'Efecto de colapso', 'Boss': 'Jefe', 'Instant': 'Instantáneo', 'No Disappear': 'No desaparecer', 'Party Ability': 'Habilidad de grupo', 'Encounter Half': 'Encuentros a la mitad', 'Encounter None': 'Sin encuentros', 'Cancel Surprise': 'Anular sorpresa', 'Raise Preemptive': 'Subir preemptivo', 'Gold Double': 'Oro doble', 'Drop Item Double': 'Objetos dobles', 'Please select a trait type before saving.': 'Selecciona un tipo de rasgo antes de guardar.' });
Object.assign(RR_TEXT_TRANSLATIONS['zh-Hant'], { 'Rates': '率', 'Param': '參數', 'Equip': '裝備', 'Other': '其他', 'Element Rate': '屬性有效度', 'Debuff Rate': '弱化有效度', 'State Rate': '狀態有效度', 'State Resist': '狀態抗性', 'Ex-Parameter': '追加參數', 'Sp-Parameter': '特殊參數', 'Hit Rate': '命中率', 'Evasion Rate': '迴避率', 'Critical Rate': '會心率', 'Critical Evasion': '會心迴避', 'Magic Evasion': '魔法迴避', 'Magic Reflection': '魔法反射', 'Counter Attack': '反擊', 'HP Regeneration': 'HP 再生', 'MP Regeneration': 'MP 再生', 'TP Regeneration': 'TP 再生', 'Target Rate': '被攻擊率', 'Guard Effect': '防禦效果', 'Recovery Effect': '恢復效果', 'Pharmacology': '藥物知識', 'MP Cost Rate': 'MP 消耗率', 'TP Charge Rate': 'TP 充能率', 'Physical Damage': '物理傷害', 'Magical Damage': '魔法傷害', 'Floor Damage': '地形傷害', 'Experience': '經驗值', 'Attack Element': '攻擊屬性', 'Attack State': '攻擊狀態', 'Attack Speed': '攻擊速度', 'Attack Times+': '攻擊次數+', 'Attack Skill': '攻擊技能', 'Add Skill Type': '新增技能類型', 'Seal Skill Type': '封印技能類型', 'Add Skill': '新增技能', 'Seal Skill': '封印技能', 'Equip Weapon': '裝備武器', 'Equip Armor': '裝備防具', 'Lock Equip': '鎖定裝備', 'Seal Equip': '封印裝備', 'Slot Type': '欄位類型', 'Dual Wield': '雙持', 'Action Times+': '行動次數+', 'Special Flag': '特殊標記', 'Auto Battle': '自動戰鬥', 'Guard': '防禦', 'Substitute': '代替承受', 'Preserve TP': '保留 TP', 'Collapse Effect': '消失效果', 'Boss': '首領', 'Instant': '瞬間', 'No Disappear': '不消失', 'Party Ability': '隊伍能力', 'Encounter Half': '遇敵減半', 'Encounter None': '不遇敵', 'Cancel Surprise': '防止偷襲', 'Raise Preemptive': '提升先制', 'Gold Double': '金錢兩倍', 'Drop Item Double': '掉落兩倍', 'Please select a trait type before saving.': '儲存前請選擇特性類型。' });
Object.assign(RR_TEXT_TRANSLATIONS['zh-Hans'], { 'Rates': '率', 'Param': '参数', 'Equip': '装备', 'Other': '其他', 'Element Rate': '属性有效度', 'Debuff Rate': '弱化有效度', 'State Rate': '状态有效度', 'State Resist': '状态抗性', 'Ex-Parameter': '追加参数', 'Sp-Parameter': '特殊参数', 'Hit Rate': '命中率', 'Evasion Rate': '闪避率', 'Critical Rate': '会心率', 'Critical Evasion': '会心闪避', 'Magic Evasion': '魔法闪避', 'Magic Reflection': '魔法反射', 'Counter Attack': '反击', 'HP Regeneration': 'HP 再生', 'MP Regeneration': 'MP 再生', 'TP Regeneration': 'TP 再生', 'Target Rate': '被攻击率', 'Guard Effect': '防御效果', 'Recovery Effect': '恢复效果', 'Pharmacology': '药物知识', 'MP Cost Rate': 'MP 消耗率', 'TP Charge Rate': 'TP 充能率', 'Physical Damage': '物理伤害', 'Magical Damage': '魔法伤害', 'Floor Damage': '地形伤害', 'Experience': '经验值', 'Attack Element': '攻击属性', 'Attack State': '攻击状态', 'Attack Speed': '攻击速度', 'Attack Times+': '攻击次数+', 'Attack Skill': '攻击技能', 'Add Skill Type': '新增技能类型', 'Seal Skill Type': '封印技能类型', 'Add Skill': '新增技能', 'Seal Skill': '封印技能', 'Equip Weapon': '装备武器', 'Equip Armor': '装备防具', 'Lock Equip': '锁定装备', 'Seal Equip': '封印装备', 'Slot Type': '栏位类型', 'Dual Wield': '双持', 'Action Times+': '行动次数+', 'Special Flag': '特殊标记', 'Auto Battle': '自动战斗', 'Guard': '防御', 'Substitute': '代替承受', 'Preserve TP': '保留 TP', 'Collapse Effect': '消失效果', 'Boss': '首领', 'Instant': '瞬间', 'No Disappear': '不消失', 'Party Ability': '队伍能力', 'Encounter Half': '遇敌减半', 'Encounter None': '不遇敌', 'Cancel Surprise': '防止偷袭', 'Raise Preemptive': '提升先制', 'Gold Double': '金钱两倍', 'Drop Item Double': '掉落两倍', 'Please select a trait type before saving.': '保存前请选择特性类型。' });
Object.assign(RR_TEXT_TRANSLATIONS.ru, { 'Rates': 'Ставки', 'Param': 'Парам.', 'Equip': 'Экип.', 'Other': 'Другое', 'Element Rate': 'Эффективность Элемента', 'Debuff Rate': 'Эффективность Ослабления', 'State Rate': 'Эффективность Состояния', 'State Resist': 'Сопротивление Состоянию', 'Ex-Parameter': 'Доп. Параметр', 'Sp-Parameter': 'Спец. Параметр', 'Hit Rate': 'Меткость', 'Evasion Rate': 'Уклонение', 'Critical Rate': 'Крит. Шанс', 'Critical Evasion': 'Крит. Уклонение', 'Magic Evasion': 'Маг. Уклонение', 'Magic Reflection': 'Маг. Отражение', 'Counter Attack': 'Контратака', 'HP Regeneration': 'Реген. HP', 'MP Regeneration': 'Реген. MP', 'TP Regeneration': 'Реген. TP', 'Target Rate': 'Шанс Цели', 'Guard Effect': 'Эффект Защиты', 'Recovery Effect': 'Эффект Лечения', 'Pharmacology': 'Фармакология', 'MP Cost Rate': 'Стоимость MP', 'TP Charge Rate': 'Заряд TP', 'Physical Damage': 'Физ. Урон', 'Magical Damage': 'Маг. Урон', 'Floor Damage': 'Урон Пола', 'Experience': 'Опыт', 'Attack Element': 'Элемент Атаки', 'Attack State': 'Состояние Атаки', 'Attack Speed': 'Скорость Атаки', 'Attack Times+': 'Атак+', 'Attack Skill': 'Навык Атаки', 'Add Skill Type': 'Добавить Тип Навыка', 'Seal Skill Type': 'Запечатать Тип Навыка', 'Add Skill': 'Добавить Навык', 'Seal Skill': 'Запечатать Навык', 'Equip Weapon': 'Экип. Оружие', 'Equip Armor': 'Экип. Броню', 'Lock Equip': 'Закрепить Экип.', 'Seal Equip': 'Запечатать Экип.', 'Slot Type': 'Тип Слота', 'Dual Wield': 'Два Оружия', 'Action Times+': 'Действий+', 'Special Flag': 'Особый Флаг', 'Auto Battle': 'Автобой', 'Guard': 'Защита', 'Substitute': 'Замещение', 'Preserve TP': 'Сохранять TP', 'Collapse Effect': 'Эффект Исчезновения', 'Boss': 'Босс', 'Instant': 'Мгновенно', 'No Disappear': 'Не Исчезает', 'Party Ability': 'Способность Группы', 'Encounter Half': 'Встречи Пополам', 'Encounter None': 'Без Встреч', 'Cancel Surprise': 'Отмена Засады', 'Raise Preemptive': 'Чаще Превентивно', 'Gold Double': 'Двойное Золото', 'Drop Item Double': 'Двойной Дроп', 'Please select a trait type before saving.': 'Выберите тип черты перед сохранением.' });
Object.assign(RR_TEXT_TRANSLATIONS.pt, { 'Rates': 'Taxas', 'Param': 'Parâm.', 'Equip': 'Equip.', 'Other': 'Outro', 'Element Rate': 'Taxa De Elemento', 'Debuff Rate': 'Taxa De Penalidade', 'State Rate': 'Taxa De Estado', 'State Resist': 'Resistir Estado', 'Ex-Parameter': 'Ex-Parâmetro', 'Sp-Parameter': 'Parâmetro Esp.', 'Hit Rate': 'Taxa De Acerto', 'Evasion Rate': 'Evasão', 'Critical Rate': 'Crítico', 'Critical Evasion': 'Evasão Crítica', 'Magic Evasion': 'Evasão Mágica', 'Magic Reflection': 'Reflexão Mágica', 'Counter Attack': 'Contra-Ataque', 'HP Regeneration': 'Regeneração HP', 'MP Regeneration': 'Regeneração MP', 'TP Regeneration': 'Regeneração TP', 'Target Rate': 'Taxa De Alvo', 'Guard Effect': 'Efeito De Guarda', 'Recovery Effect': 'Efeito De Recuperação', 'Pharmacology': 'Farmacologia', 'MP Cost Rate': 'Taxa De Custo MP', 'TP Charge Rate': 'Taxa De Carga TP', 'Physical Damage': 'Dano Físico', 'Magical Damage': 'Dano Mágico', 'Floor Damage': 'Dano De Piso', 'Experience': 'Experiência', 'Attack Element': 'Elemento De Ataque', 'Attack State': 'Estado De Ataque', 'Attack Speed': 'Velocidade De Ataque', 'Attack Times+': 'Ataques+', 'Attack Skill': 'Habilidade De Ataque', 'Add Skill Type': 'Adicionar Tipo De Habilidade', 'Seal Skill Type': 'Selar Tipo De Habilidade', 'Add Skill': 'Adicionar Habilidade', 'Seal Skill': 'Selar Habilidade', 'Equip Weapon': 'Equipar Arma', 'Equip Armor': 'Equipar Armadura', 'Lock Equip': 'Travar Equipamento', 'Seal Equip': 'Selar Equipamento', 'Slot Type': 'Tipo De Espaço', 'Dual Wield': 'Duas Armas', 'Action Times+': 'Ações+', 'Special Flag': 'Sinalizador Especial', 'Auto Battle': 'Batalha Automática', 'Guard': 'Guardar', 'Substitute': 'Substituir', 'Preserve TP': 'Preservar TP', 'Collapse Effect': 'Efeito De Colapso', 'Boss': 'Chefe', 'Instant': 'Instantâneo', 'No Disappear': 'Não Desaparece', 'Party Ability': 'Habilidade Do Grupo', 'Encounter Half': 'Encontros Pela Metade', 'Encounter None': 'Sem Encontros', 'Cancel Surprise': 'Cancelar Surpresa', 'Raise Preemptive': 'Aumentar Preemptivo', 'Gold Double': 'Ouro Dobrado', 'Drop Item Double': 'Drop Dobrado', 'Please select a trait type before saving.': 'Selecione um tipo de traço antes de salvar.' });

Object.assign(RR_TEXT_TRANSLATIONS.ja, { 'Battle Test Configuration': '戦闘テスト設定', 'Add party member': 'パーティメンバーを追加', 'Remove selected party member': '選択中のメンバーを削除', 'No party members': 'パーティメンバーなし', 'Level:': 'レベル:', 'Stats': '能力値', '(None)': '（なし）', 'System data not available': 'システムデータが利用できません', 'Failed to write test data:': 'テストデータの書き込みに失敗しました:', 'Select Character Graphic': 'キャラクター画像を選択', 'No project loaded': 'プロジェクトが読み込まれていません', 'Characters folder not found': 'characters フォルダーが見つかりません', 'No character images found in img/characters folder': 'img/characters フォルダーにキャラクター画像がありません', 'No character files available': '利用可能なキャラクターファイルがありません', 'Select a character file from the list': 'リストからキャラクターファイルを選択してください', 'Error loading files': 'ファイルの読み込みエラー', 'Single Character Sprite Sheet': '単体キャラクターのスプライトシート', 'Multi-Character Sprite Sheet (8 characters)': '複数キャラクターのスプライトシート（8体）', 'Click on the specific frame you want to use': '使用するフレームをクリックしてください', 'Failed to load image:': '画像の読み込みに失敗しました:', 'Check console for details': '詳細はコンソールを確認してください', 'Down': '下', 'Left': '左', 'Right': '右', 'Up': '上', 'Character': 'キャラクター', 'Please select a character frame': 'キャラクターフレームを選択してください', 'Search animations...': 'アニメーションを検索...', '(None) - No animation': '（なし）- アニメーションなし', 'Animation data not found': 'アニメーションデータが見つかりません', 'Effekseer Animation': 'Effekseer アニメーション', 'Sprite Animation': 'スプライトアニメーション', 'Sprite': 'スプライト', 'Frame:': 'フレーム:', 'No sprite sheets found': 'スプライトシートが見つかりません', 'Effekseer library not loaded': 'Effekseer ライブラリが読み込まれていません', 'Effekseer initialization timeout': 'Effekseer の初期化がタイムアウトしました', 'Effekseer initializing... Please wait': 'Effekseer を初期化中...お待ちください', 'WebGL not supported': 'WebGL はサポートされていません', 'No effect specified': 'エフェクトが指定されていません', 'Sound': 'サウンド', 'Pattern': 'パターン', 'Randomize': 'ランダム化', 'Reset': 'リセット', 'Clear Pattern': 'パターンをクリア', 'Duration:': '時間:', 'Archetypes': 'アーキタイプ', 'Waveform': '波形', 'Envelope (ADSR)': 'エンベロープ (ADSR)', 'Pitch Curve': 'ピッチ曲線', 'amplitude x time': '振幅 x 時間', 'gain x time': 'ゲイン x 時間', 'frequency x time': '周波数 x 時間', 'Visualizers update live as you tune sliders. Click Play to hear the result.': 'スライダー調整に合わせてビジュアライザーが更新されます。再生をクリックして結果を聴けます。', 'Pattern Editor - click or drag cells to place/erase notes. Rows = pitch (top = high), columns = time (16th notes at BPM).': 'パターンエディター - セルをクリックまたはドラッグしてノートを配置/消去します。行=ピッチ（上ほど高い）、列=時間（BPMの16分音符）。', 'Notes placed:': '配置ノート:', 'Pattern length:': 'パターン長:', 'at': '@', 'Default name:': '既定名:', 'defaults to audio/se/ - pick any location in the dialog': '既定では audio/se/ です。ダイアログで任意の場所を選べます', 'Bake & Save...': '生成して保存...', 'Noise - no pitch curve': 'ノイズ - ピッチ曲線なし', 'Enter a name for the sound effect.': '効果音名を入力してください。', 'Failed to render:': 'レンダー失敗:', 'Failed to save:': '保存失敗:', 'Saved:': '保存しました:', 'mild': '弱', 'medium': '中', 'wild': '強', 'Starter': 'スターター', 'SFX': '効果音', 'Music': '音楽', 'Source': 'ソース', 'Envelope': 'エンベロープ', 'Pitch': 'ピッチ', 'Modulation': 'モジュレーション', 'Filter': 'フィルター', 'Texture': '質感', 'Sine': 'サイン', 'Square': '矩形', 'Sawtooth': 'ノコギリ', 'Triangle': '三角', 'Noise': 'ノイズ', 'Karplus (Pluck)': 'Karplus（弦弾き）', 'Square Duty': '矩形デューティ', 'Distortion': '歪み', 'Sub-Osc Level': 'サブOSCレベル', 'Sub-Osc Detune': 'サブOSCデチューン', 'KS Dampening': 'KS減衰', 'Decay': 'ディケイ', 'Sustain Level': 'サステインレベル', 'Sustain Time': 'サステイン時間', 'Release': 'リリース', 'Base Frequency': '基準周波数', 'Pitch Slide': 'ピッチスライド', 'Pitch Peak': 'ピッチピーク', 'Pitch Decay': 'ピッチ減衰', 'Vibrato Depth': 'ビブラート深さ', 'Vibrato Rate': 'ビブラート速度', 'Tremolo Depth': 'トレモロ深さ', 'Tremolo Rate': 'トレモロ速度', 'Lowpass Start': 'ローパス開始', 'Lowpass End': 'ローパス終了', 'Lowpass Resonance': 'ローパス共振', 'Highpass Cutoff': 'ハイパスカットオフ', 'Noise Mix': 'ノイズミックス', 'Reverb Amount': 'リバーブ量', 'Reverb Decay': 'リバーブ減衰' });
Object.assign(RR_TEXT_TRANSLATIONS.es, { 'Battle Test Configuration': 'Configuración de prueba de batalla', 'Add party member': 'Añadir miembro', 'Remove selected party member': 'Quitar miembro seleccionado', 'No party members': 'Sin miembros del grupo', 'Level:': 'Nivel:', 'Stats': 'Estadísticas', '(None)': '(Ninguno)', 'System data not available': 'Datos del sistema no disponibles', 'Failed to write test data:': 'Error al escribir datos de prueba:', 'Select Character Graphic': 'Seleccionar gráfico de personaje', 'No project loaded': 'No hay proyecto cargado', 'Characters folder not found': 'Carpeta de personajes no encontrada', 'No character images found in img/characters folder': 'No se encontraron imágenes en img/characters', 'No character files available': 'No hay archivos de personajes disponibles', 'Select a character file from the list': 'Selecciona un archivo de la lista', 'Error loading files': 'Error al cargar archivos', 'Single Character Sprite Sheet': 'Hoja de sprite de personaje único', 'Multi-Character Sprite Sheet (8 characters)': 'Hoja de sprites múltiple (8 personajes)', 'Click on the specific frame you want to use': 'Haz clic en el fotograma que quieres usar', 'Failed to load image:': 'Error al cargar imagen:', 'Check console for details': 'Consulta la consola para detalles', 'Down': 'Abajo', 'Left': 'Izquierda', 'Right': 'Derecha', 'Up': 'Arriba', 'Character': 'Personaje', 'Please select a character frame': 'Selecciona un fotograma de personaje', 'Search animations...': 'Buscar animaciones...', '(None) - No animation': '(Ninguno) - Sin animación', 'Animation data not found': 'Datos de animación no encontrados', 'Effekseer Animation': 'Animación Effekseer', 'Sprite Animation': 'Animación de sprite', 'Sprite': 'Sprite', 'Frame:': 'Fotograma:', 'No sprite sheets found': 'No se encontraron hojas de sprites', 'Effekseer library not loaded': 'Biblioteca Effekseer no cargada', 'Effekseer initialization timeout': 'Tiempo agotado inicializando Effekseer', 'Effekseer initializing... Please wait': 'Inicializando Effekseer... espera', 'WebGL not supported': 'WebGL no compatible', 'No effect specified': 'No se especificó efecto', 'Sound': 'Sonido', 'Pattern': 'Patrón', 'Randomize': 'Aleatorizar', 'Reset': 'Restablecer', 'Clear Pattern': 'Limpiar patrón', 'Duration:': 'Duración:', 'Archetypes': 'Arquetipos', 'Waveform': 'Forma de onda', 'Envelope (ADSR)': 'Envolvente (ADSR)', 'Pitch Curve': 'Curva de tono', 'amplitude x time': 'amplitud x tiempo', 'gain x time': 'ganancia x tiempo', 'frequency x time': 'frecuencia x tiempo', 'Visualizers update live as you tune sliders. Click Play to hear the result.': 'Los visualizadores se actualizan al mover controles. Pulsa Reproducir para escuchar.', 'Pattern Editor - click or drag cells to place/erase notes. Rows = pitch (top = high), columns = time (16th notes at BPM).': 'Editor de patrón - haz clic o arrastra celdas para poner/borrar notas. Filas = tono, columnas = tiempo.', 'Notes placed:': 'Notas colocadas:', 'Pattern length:': 'Duración del patrón:', 'at': 'a', 'Default name:': 'Nombre predeterminado:', 'defaults to audio/se/ - pick any location in the dialog': 'por defecto audio/se/ - elige cualquier ubicación en el diálogo', 'Bake & Save...': 'Generar y guardar...', 'Noise - no pitch curve': 'Ruido - sin curva de tono', 'Enter a name for the sound effect.': 'Introduce un nombre para el efecto sonoro.', 'Failed to render:': 'Error al renderizar:', 'Failed to save:': 'Error al guardar:', 'Saved:': 'Guardado:', 'mild': 'suave', 'medium': 'medio', 'wild': 'fuerte', 'Starter': 'Inicial', 'SFX': 'SFX', 'Music': 'Música', 'Source': 'Fuente', 'Envelope': 'Envolvente', 'Pitch': 'Tono', 'Modulation': 'Modulación', 'Filter': 'Filtro', 'Texture': 'Textura', 'Sine': 'Seno', 'Square': 'Cuadrada', 'Sawtooth': 'Sierra', 'Triangle': 'Triángulo', 'Noise': 'Ruido', 'Karplus (Pluck)': 'Karplus (pulsada)', 'Square Duty': 'Ciclo cuadrado', 'Distortion': 'Distorsión', 'Sub-Osc Level': 'Nivel sub-osc', 'Sub-Osc Detune': 'Desafinación sub-osc', 'KS Dampening': 'Amortiguación KS', 'Decay': 'Decaimiento', 'Sustain Level': 'Nivel de sostén', 'Sustain Time': 'Tiempo de sostén', 'Release': 'Liberación', 'Base Frequency': 'Frecuencia base', 'Pitch Slide': 'Deslizamiento de tono', 'Pitch Peak': 'Pico de tono', 'Pitch Decay': 'Decaimiento de tono', 'Vibrato Depth': 'Profundidad vibrato', 'Vibrato Rate': 'Velocidad vibrato', 'Tremolo Depth': 'Profundidad trémolo', 'Tremolo Rate': 'Velocidad trémolo', 'Lowpass Start': 'Inicio paso bajo', 'Lowpass End': 'Fin paso bajo', 'Lowpass Resonance': 'Resonancia paso bajo', 'Highpass Cutoff': 'Corte paso alto', 'Noise Mix': 'Mezcla de ruido', 'Reverb Amount': 'Cantidad de reverb', 'Reverb Decay': 'Decaimiento reverb' });
Object.assign(RR_TEXT_TRANSLATIONS['zh-Hant'], { 'Battle Test Configuration': '戰鬥測試設定', 'Add party member': '新增隊伍成員', 'Remove selected party member': '移除選取成員', 'No party members': '沒有隊伍成員', 'Level:': '等級:', 'Stats': '能力值', '(None)': '（無）', 'System data not available': '系統資料不可用', 'Failed to write test data:': '寫入測試資料失敗:', 'Select Character Graphic': '選擇角色圖像', 'No project loaded': '未載入專案', 'Characters folder not found': '找不到 characters 資料夾', 'No character images found in img/characters folder': 'img/characters 資料夾中沒有角色圖片', 'No character files available': '沒有可用的角色檔案', 'Select a character file from the list': '請從清單選擇角色檔案', 'Error loading files': '載入檔案時發生錯誤', 'Single Character Sprite Sheet': '單一角色精靈表', 'Multi-Character Sprite Sheet (8 characters)': '多角色精靈表（8 個角色）', 'Click on the specific frame you want to use': '點選要使用的指定影格', 'Failed to load image:': '載入圖片失敗:', 'Check console for details': '請查看主控台取得詳細資料', 'Down': '下', 'Left': '左', 'Right': '右', 'Up': '上', 'Character': '角色', 'Please select a character frame': '請選擇角色影格', 'Search animations...': '搜尋動畫...', '(None) - No animation': '（無）- 無動畫', 'Animation data not found': '找不到動畫資料', 'Effekseer Animation': 'Effekseer 動畫', 'Sprite Animation': '精靈動畫', 'Sprite': '精靈', 'Frame:': '影格:', 'No sprite sheets found': '找不到精靈表', 'Effekseer library not loaded': 'Effekseer 程式庫未載入', 'Effekseer initialization timeout': 'Effekseer 初始化逾時', 'Effekseer initializing... Please wait': 'Effekseer 初始化中...請稍候', 'WebGL not supported': '不支援 WebGL', 'No effect specified': '未指定效果', 'Sound': '聲音', 'Pattern': '模式', 'Randomize': '隨機化', 'Reset': '重設', 'Clear Pattern': '清除模式', 'Duration:': '持續時間:', 'Archetypes': '原型', 'Waveform': '波形', 'Envelope (ADSR)': '包絡 (ADSR)', 'Pitch Curve': '音高曲線', 'amplitude x time': '振幅 x 時間', 'gain x time': '增益 x 時間', 'frequency x time': '頻率 x 時間', 'Visualizers update live as you tune sliders. Click Play to hear the result.': '調整滑桿時視覺化會即時更新。點擊播放即可聆聽結果。', 'Pattern Editor - click or drag cells to place/erase notes. Rows = pitch (top = high), columns = time (16th notes at BPM).': '模式編輯器 - 點擊或拖曳格子以放置/清除音符。列為音高，欄為時間。', 'Notes placed:': '已放置音符:', 'Pattern length:': '模式長度:', 'at': '於', 'Default name:': '預設名稱:', 'defaults to audio/se/ - pick any location in the dialog': '預設為 audio/se/，可在對話框選擇任意位置', 'Bake & Save...': '烘焙並儲存...', 'Noise - no pitch curve': '噪音 - 無音高曲線', 'Enter a name for the sound effect.': '請輸入音效名稱。', 'Failed to render:': '渲染失敗:', 'Failed to save:': '儲存失敗:', 'Saved:': '已儲存:', 'mild': '輕微', 'medium': '中等', 'wild': '劇烈', 'Starter': '入門', 'SFX': '音效', 'Music': '音樂', 'Source': '來源', 'Envelope': '包絡', 'Pitch': '音高', 'Modulation': '調變', 'Filter': '濾波器', 'Texture': '質感', 'Sine': '正弦', 'Square': '方波', 'Sawtooth': '鋸齒波', 'Triangle': '三角波', 'Noise': '噪音', 'Karplus (Pluck)': 'Karplus（撥弦）', 'Square Duty': '方波占空比', 'Distortion': '失真', 'Sub-Osc Level': '副振盪器音量', 'Sub-Osc Detune': '副振盪器微調', 'KS Dampening': 'KS 阻尼', 'Decay': '衰減', 'Sustain Level': '延音音量', 'Sustain Time': '延音時間', 'Release': '釋放', 'Base Frequency': '基礎頻率', 'Pitch Slide': '音高滑動', 'Pitch Peak': '音高峰值', 'Pitch Decay': '音高衰減', 'Vibrato Depth': '顫音深度', 'Vibrato Rate': '顫音速度', 'Tremolo Depth': '震音深度', 'Tremolo Rate': '震音速度', 'Lowpass Start': '低通開始', 'Lowpass End': '低通結束', 'Lowpass Resonance': '低通共振', 'Highpass Cutoff': '高通截止', 'Noise Mix': '噪音混合', 'Reverb Amount': '殘響量', 'Reverb Decay': '殘響衰減' });
Object.assign(RR_TEXT_TRANSLATIONS['zh-Hans'], { 'Battle Test Configuration': '战斗测试设置', 'Add party member': '新增队伍成员', 'Remove selected party member': '移除选中成员', 'No party members': '没有队伍成员', 'Level:': '等级:', 'Stats': '能力值', '(None)': '（无）', 'System data not available': '系统数据不可用', 'Failed to write test data:': '写入测试数据失败:', 'Select Character Graphic': '选择角色图像', 'No project loaded': '未加载项目', 'Characters folder not found': '找不到 characters 文件夹', 'No character images found in img/characters folder': 'img/characters 文件夹中没有角色图片', 'No character files available': '没有可用的角色文件', 'Select a character file from the list': '请从列表选择角色文件', 'Error loading files': '加载文件时出错', 'Single Character Sprite Sheet': '单角色精灵表', 'Multi-Character Sprite Sheet (8 characters)': '多角色精灵表（8 个角色）', 'Click on the specific frame you want to use': '点击要使用的指定帧', 'Failed to load image:': '加载图片失败:', 'Check console for details': '请查看控制台获取详细信息', 'Down': '下', 'Left': '左', 'Right': '右', 'Up': '上', 'Character': '角色', 'Please select a character frame': '请选择角色帧', 'Search animations...': '搜索动画...', '(None) - No animation': '（无）- 无动画', 'Animation data not found': '找不到动画数据', 'Effekseer Animation': 'Effekseer 动画', 'Sprite Animation': '精灵动画', 'Sprite': '精灵', 'Frame:': '帧:', 'No sprite sheets found': '找不到精灵表', 'Effekseer library not loaded': 'Effekseer 库未加载', 'Effekseer initialization timeout': 'Effekseer 初始化超时', 'Effekseer initializing... Please wait': 'Effekseer 初始化中...请稍候', 'WebGL not supported': '不支持 WebGL', 'No effect specified': '未指定效果', 'Sound': '声音', 'Pattern': '模式', 'Randomize': '随机化', 'Reset': '重置', 'Clear Pattern': '清除模式', 'Duration:': '持续时间:', 'Archetypes': '原型', 'Waveform': '波形', 'Envelope (ADSR)': '包络 (ADSR)', 'Pitch Curve': '音高曲线', 'amplitude x time': '振幅 x 时间', 'gain x time': '增益 x 时间', 'frequency x time': '频率 x 时间', 'Visualizers update live as you tune sliders. Click Play to hear the result.': '调整滑块时可视化会实时更新。点击播放即可聆听结果。', 'Pattern Editor - click or drag cells to place/erase notes. Rows = pitch (top = high), columns = time (16th notes at BPM).': '模式编辑器 - 点击或拖拽格子以放置/清除音符。行为音高，列为时间。', 'Notes placed:': '已放置音符:', 'Pattern length:': '模式长度:', 'at': '于', 'Default name:': '默认名称:', 'defaults to audio/se/ - pick any location in the dialog': '默认为 audio/se/，可在对话框选择任意位置', 'Bake & Save...': '烘焙并保存...', 'Noise - no pitch curve': '噪音 - 无音高曲线', 'Enter a name for the sound effect.': '请输入音效名称。', 'Failed to render:': '渲染失败:', 'Failed to save:': '保存失败:', 'Saved:': '已保存:', 'mild': '轻微', 'medium': '中等', 'wild': '剧烈', 'Starter': '入门', 'SFX': '音效', 'Music': '音乐', 'Source': '来源', 'Envelope': '包络', 'Pitch': '音高', 'Modulation': '调制', 'Filter': '滤波器', 'Texture': '质感', 'Sine': '正弦', 'Square': '方波', 'Sawtooth': '锯齿波', 'Triangle': '三角波', 'Noise': '噪音', 'Karplus (Pluck)': 'Karplus（拨弦）', 'Square Duty': '方波占空比', 'Distortion': '失真', 'Sub-Osc Level': '副振荡器音量', 'Sub-Osc Detune': '副振荡器微调', 'KS Dampening': 'KS 阻尼', 'Decay': '衰减', 'Sustain Level': '延音音量', 'Sustain Time': '延音时间', 'Release': '释放', 'Base Frequency': '基础频率', 'Pitch Slide': '音高滑动', 'Pitch Peak': '音高峰值', 'Pitch Decay': '音高衰减', 'Vibrato Depth': '颤音深度', 'Vibrato Rate': '颤音速度', 'Tremolo Depth': '震音深度', 'Tremolo Rate': '震音速度', 'Lowpass Start': '低通开始', 'Lowpass End': '低通结束', 'Lowpass Resonance': '低通共振', 'Highpass Cutoff': '高通截止', 'Noise Mix': '噪音混合', 'Reverb Amount': '混响量', 'Reverb Decay': '混响衰减' });
Object.assign(RR_TEXT_TRANSLATIONS.ru, { 'Battle Test Configuration': 'Настройка Теста Боя', 'Add party member': 'Добавить участника', 'Remove selected party member': 'Удалить выбранного участника', 'No party members': 'Нет участников группы', 'Level:': 'Уровень:', 'Stats': 'Статы', '(None)': '(Нет)', 'System data not available': 'Системные данные недоступны', 'Failed to write test data:': 'Не удалось записать тестовые данные:', 'Select Character Graphic': 'Выбрать Графику Персонажа', 'No project loaded': 'Проект не загружен', 'Characters folder not found': 'Папка characters не найдена', 'No character images found in img/characters folder': 'В img/characters нет изображений персонажей', 'No character files available': 'Нет доступных файлов персонажей', 'Select a character file from the list': 'Выберите файл персонажа из списка', 'Error loading files': 'Ошибка загрузки файлов', 'Single Character Sprite Sheet': 'Лист спрайтов одного персонажа', 'Multi-Character Sprite Sheet (8 characters)': 'Лист спрайтов нескольких персонажей (8)', 'Click on the specific frame you want to use': 'Нажмите нужный кадр', 'Failed to load image:': 'Не удалось загрузить изображение:', 'Check console for details': 'Подробности в консоли', 'Down': 'Вниз', 'Left': 'Влево', 'Right': 'Вправо', 'Up': 'Вверх', 'Character': 'Персонаж', 'Please select a character frame': 'Выберите кадр персонажа', 'Search animations...': 'Поиск анимаций...', '(None) - No animation': '(Нет) - Нет анимации', 'Animation data not found': 'Данные анимации не найдены', 'Effekseer Animation': 'Анимация Effekseer', 'Sprite Animation': 'Спрайтовая Анимация', 'Sprite': 'Спрайт', 'Frame:': 'Кадр:', 'No sprite sheets found': 'Листы спрайтов не найдены', 'Effekseer library not loaded': 'Библиотека Effekseer не загружена', 'Effekseer initialization timeout': 'Таймаут инициализации Effekseer', 'Effekseer initializing... Please wait': 'Инициализация Effekseer... подождите', 'WebGL not supported': 'WebGL не поддерживается', 'No effect specified': 'Эффект не указан', 'Sound': 'Звук', 'Pattern': 'Паттерн', 'Randomize': 'Случайно', 'Reset': 'Сброс', 'Clear Pattern': 'Очистить Паттерн', 'Duration:': 'Длительность:', 'Archetypes': 'Архетипы', 'Waveform': 'Форма Волны', 'Envelope (ADSR)': 'Огибающая (ADSR)', 'Pitch Curve': 'Кривая Тона', 'amplitude x time': 'амплитуда x время', 'gain x time': 'усиление x время', 'frequency x time': 'частота x время', 'Visualizers update live as you tune sliders. Click Play to hear the result.': 'Визуализаторы обновляются при настройке. Нажмите Играть, чтобы услышать результат.', 'Pattern Editor - click or drag cells to place/erase notes. Rows = pitch (top = high), columns = time (16th notes at BPM).': 'Редактор паттерна - нажимайте или тяните клетки, чтобы ставить/стирать ноты. Строки = тон, столбцы = время.', 'Notes placed:': 'Нот размещено:', 'Pattern length:': 'Длина паттерна:', 'at': 'при', 'Default name:': 'Имя по умолчанию:', 'defaults to audio/se/ - pick any location in the dialog': 'по умолчанию audio/se/ - выберите любое место в диалоге', 'Bake & Save...': 'Создать и сохранить...', 'Noise - no pitch curve': 'Шум - нет кривой тона', 'Enter a name for the sound effect.': 'Введите имя звукового эффекта.', 'Failed to render:': 'Не удалось отрендерить:', 'Failed to save:': 'Не удалось сохранить:', 'Saved:': 'Сохранено:', 'mild': 'мягко', 'medium': 'средне', 'wild': 'сильно', 'Starter': 'Старт', 'SFX': 'Звуки', 'Music': 'Музыка', 'Source': 'Источник', 'Envelope': 'Огибающая', 'Pitch': 'Тон', 'Modulation': 'Модуляция', 'Filter': 'Фильтр', 'Texture': 'Текстура', 'Sine': 'Синус', 'Square': 'Квадрат', 'Sawtooth': 'Пила', 'Triangle': 'Треугольник', 'Noise': 'Шум', 'Karplus (Pluck)': 'Karplus (щипок)', 'Square Duty': 'Скважность', 'Distortion': 'Искажение', 'Sub-Osc Level': 'Уровень Sub-Osc', 'Sub-Osc Detune': 'Расстройка Sub-Osc', 'KS Dampening': 'Затухание KS', 'Decay': 'Спад', 'Sustain Level': 'Уровень Сустейна', 'Sustain Time': 'Время Сустейна', 'Release': 'Релиз', 'Base Frequency': 'Базовая Частота', 'Pitch Slide': 'Слайд Тона', 'Pitch Peak': 'Пик Тона', 'Pitch Decay': 'Спад Тона', 'Vibrato Depth': 'Глубина Вибрато', 'Vibrato Rate': 'Скорость Вибрато', 'Tremolo Depth': 'Глубина Тремоло', 'Tremolo Rate': 'Скорость Тремоло', 'Lowpass Start': 'Начало НЧ', 'Lowpass End': 'Конец НЧ', 'Lowpass Resonance': 'Резонанс НЧ', 'Highpass Cutoff': 'Срез ВЧ', 'Noise Mix': 'Смесь Шума', 'Reverb Amount': 'Количество Реверба', 'Reverb Decay': 'Спад Реверба' });
Object.assign(RR_TEXT_TRANSLATIONS.pt, { 'Battle Test Configuration': 'Configuração Do Teste De Batalha', 'Add party member': 'Adicionar membro', 'Remove selected party member': 'Remover membro selecionado', 'No party members': 'Nenhum membro no grupo', 'Level:': 'Nível:', 'Stats': 'Atributos', '(None)': '(Nenhum)', 'System data not available': 'Dados do sistema indisponíveis', 'Failed to write test data:': 'Falha ao gravar dados de teste:', 'Select Character Graphic': 'Selecionar Gráfico Do Personagem', 'No project loaded': 'Nenhum projeto carregado', 'Characters folder not found': 'Pasta characters não encontrada', 'No character images found in img/characters folder': 'Nenhuma imagem em img/characters', 'No character files available': 'Nenhum arquivo de personagem disponível', 'Select a character file from the list': 'Selecione um arquivo na lista', 'Error loading files': 'Erro ao carregar arquivos', 'Single Character Sprite Sheet': 'Folha de sprite de personagem único', 'Multi-Character Sprite Sheet (8 characters)': 'Folha multi-personagem (8 personagens)', 'Click on the specific frame you want to use': 'Clique no quadro que deseja usar', 'Failed to load image:': 'Falha ao carregar imagem:', 'Check console for details': 'Veja o console para detalhes', 'Down': 'Baixo', 'Left': 'Esquerda', 'Right': 'Direita', 'Up': 'Cima', 'Character': 'Personagem', 'Please select a character frame': 'Selecione um quadro de personagem', 'Search animations...': 'Buscar animações...', '(None) - No animation': '(Nenhum) - Sem animação', 'Animation data not found': 'Dados da animação não encontrados', 'Effekseer Animation': 'Animação Effekseer', 'Sprite Animation': 'Animação De Sprite', 'Sprite': 'Sprite', 'Frame:': 'Quadro:', 'No sprite sheets found': 'Nenhuma folha de sprites encontrada', 'Effekseer library not loaded': 'Biblioteca Effekseer não carregada', 'Effekseer initialization timeout': 'Tempo esgotado ao iniciar Effekseer', 'Effekseer initializing... Please wait': 'Inicializando Effekseer... aguarde', 'WebGL not supported': 'WebGL não suportado', 'No effect specified': 'Nenhum efeito especificado', 'Sound': 'Som', 'Pattern': 'Padrão', 'Randomize': 'Aleatorizar', 'Reset': 'Redefinir', 'Clear Pattern': 'Limpar Padrão', 'Duration:': 'Duração:', 'Archetypes': 'Arquétipos', 'Waveform': 'Forma De Onda', 'Envelope (ADSR)': 'Envelope (ADSR)', 'Pitch Curve': 'Curva De Tom', 'amplitude x time': 'amplitude x tempo', 'gain x time': 'ganho x tempo', 'frequency x time': 'frequência x tempo', 'Visualizers update live as you tune sliders. Click Play to hear the result.': 'Os visualizadores atualizam ao ajustar sliders. Clique Reproduzir para ouvir.', 'Pattern Editor - click or drag cells to place/erase notes. Rows = pitch (top = high), columns = time (16th notes at BPM).': 'Editor de padrão - clique ou arraste células para pôr/apagar notas. Linhas = tom, colunas = tempo.', 'Notes placed:': 'Notas colocadas:', 'Pattern length:': 'Duração do padrão:', 'at': 'a', 'Default name:': 'Nome padrão:', 'defaults to audio/se/ - pick any location in the dialog': 'padrão em audio/se/ - escolha qualquer local no diálogo', 'Bake & Save...': 'Gerar e salvar...', 'Noise - no pitch curve': 'Ruído - sem curva de tom', 'Enter a name for the sound effect.': 'Digite um nome para o efeito sonoro.', 'Failed to render:': 'Falha ao renderizar:', 'Failed to save:': 'Falha ao salvar:', 'Saved:': 'Salvo:', 'mild': 'leve', 'medium': 'médio', 'wild': 'forte', 'Starter': 'Inicial', 'SFX': 'SFX', 'Music': 'Música', 'Source': 'Fonte', 'Envelope': 'Envelope', 'Pitch': 'Tom', 'Modulation': 'Modulação', 'Filter': 'Filtro', 'Texture': 'Textura', 'Sine': 'Seno', 'Square': 'Quadrada', 'Sawtooth': 'Dente De Serra', 'Triangle': 'Triângulo', 'Noise': 'Ruído', 'Karplus (Pluck)': 'Karplus (Puxada)', 'Square Duty': 'Duty Quadrado', 'Distortion': 'Distorção', 'Sub-Osc Level': 'Nível Sub-Osc', 'Sub-Osc Detune': 'Desafinação Sub-Osc', 'KS Dampening': 'Amortecimento KS', 'Decay': 'Decaimento', 'Sustain Level': 'Nível De Sustentação', 'Sustain Time': 'Tempo De Sustentação', 'Release': 'Liberação', 'Base Frequency': 'Frequência Base', 'Pitch Slide': 'Deslizamento De Tom', 'Pitch Peak': 'Pico De Tom', 'Pitch Decay': 'Decaimento De Tom', 'Vibrato Depth': 'Profundidade Vibrato', 'Vibrato Rate': 'Velocidade Vibrato', 'Tremolo Depth': 'Profundidade Trêmolo', 'Tremolo Rate': 'Velocidade Trêmolo', 'Lowpass Start': 'Início Passa-Baixa', 'Lowpass End': 'Fim Passa-Baixa', 'Lowpass Resonance': 'Ressonância Passa-Baixa', 'Highpass Cutoff': 'Corte Passa-Alta', 'Noise Mix': 'Mistura De Ruído', 'Reverb Amount': 'Quantidade De Reverb', 'Reverb Decay': 'Decaimento Do Reverb' });

Object.assign(RR_TEXT_TRANSLATIONS.ja, { 'OK': 'OK', 'Cancel': 'キャンセル', 'Clear': 'クリア', 'Play': '再生', 'Stop': '停止' });
Object.assign(RR_TEXT_TRANSLATIONS.es, { 'OK': 'OK', 'Cancel': 'Cancelar', 'Clear': 'Limpiar', 'Play': 'Reproducir', 'Stop': 'Detener' });
Object.assign(RR_TEXT_TRANSLATIONS['zh-Hant'], { 'OK': '確定', 'Cancel': '取消', 'Clear': '清除', 'Play': '播放', 'Stop': '停止' });
Object.assign(RR_TEXT_TRANSLATIONS['zh-Hans'], { 'OK': '确定', 'Cancel': '取消', 'Clear': '清除', 'Play': '播放', 'Stop': '停止' });
Object.assign(RR_TEXT_TRANSLATIONS.ru, { 'OK': 'OK', 'Cancel': 'Отмена', 'Clear': 'Очистить', 'Play': 'Играть', 'Stop': 'Стоп' });
Object.assign(RR_TEXT_TRANSLATIONS.pt, { 'OK': 'OK', 'Cancel': 'Cancelar', 'Clear': 'Limpar', 'Play': 'Reproduzir', 'Stop': 'Parar' });

Object.assign(RR_TEXT_TRANSLATIONS.ja, { 'New': '新規', 'Cut': '切り取り', 'Copy': 'コピー', 'Paste': '貼り付け', 'Delete': '削除', 'Select All': 'すべて選択', 'Copy As Text': 'テキストとしてコピー', 'Copy As HTML': 'HTMLとしてコピー', 'Toggle Skip': 'スキップ切替', 'Test': 'テスト', 'No event commands in clipboard to paste.': '貼り付けるイベントコマンドがクリップボードにありません。', 'Variable': '変数', 'Single': '単体', 'Batch': '範囲', 'Set': '代入', 'Sub': '減算', 'Mul': '乗算', 'Div': '除算', 'Mod': '剰余', 'Random': '乱数', 'Game Data': 'ゲームデータ', 'Min:': '最小:', 'Max:': '最大:', 'Member #:': 'メンバー番号:', 'Weapon': '武器', 'Shield': '盾', 'Head': '頭', 'Body': '体', 'Accessory': '装飾品', 'Entire Troop': '敵グループ全体', 'Player': 'プレイヤー', 'This Event': 'このイベント', 'Wait for Completion': '完了まで待つ', 'frames': 'フレーム', 'Face:': '顔:', 'Message:': 'メッセージ:', 'Maximum 4 lines of text': '最大4行のテキスト', 'Window Position:': 'ウィンドウ位置:', 'Preview': 'プレビュー', 'Open in Folder': 'フォルダーで開く', 'Please enter a valid number between 1 and 5000.': '1から5000までの有効な数値を入力してください。' });
Object.assign(RR_TEXT_TRANSLATIONS.es, { 'New': 'Nuevo', 'Cut': 'Cortar', 'Copy': 'Copiar', 'Paste': 'Pegar', 'Delete': 'Eliminar', 'Select All': 'Seleccionar todo', 'Copy As Text': 'Copiar como texto', 'Copy As HTML': 'Copiar como HTML', 'Toggle Skip': 'Alternar salto', 'Test': 'Probar', 'No event commands in clipboard to paste.': 'No hay comandos de evento en el portapapeles.', 'Variable': 'Variable', 'Single': 'Individual', 'Batch': 'Lote', 'Set': 'Establecer', 'Sub': 'Restar', 'Mul': 'Multiplicar', 'Div': 'Dividir', 'Mod': 'Módulo', 'Random': 'Aleatorio', 'Game Data': 'Datos del juego', 'Min:': 'Mín:', 'Max:': 'Máx:', 'Member #:': 'Miembro n.º:', 'Weapon': 'Arma', 'Shield': 'Escudo', 'Head': 'Cabeza', 'Body': 'Cuerpo', 'Accessory': 'Accesorio', 'Entire Troop': 'Tropa completa', 'Player': 'Jugador', 'This Event': 'Este evento', 'Wait for Completion': 'Esperar finalización', 'frames': 'fotogramas', 'Face:': 'Rostro:', 'Message:': 'Mensaje:', 'Maximum 4 lines of text': 'Máximo 4 líneas de texto', 'Window Position:': 'Posición de ventana:', 'Preview': 'Vista previa', 'Open in Folder': 'Abrir en carpeta', 'Please enter a valid number between 1 and 5000.': 'Introduce un número válido entre 1 y 5000.' });
Object.assign(RR_TEXT_TRANSLATIONS['zh-Hant'], { 'New': '新增', 'Cut': '剪下', 'Copy': '複製', 'Paste': '貼上', 'Delete': '刪除', 'Select All': '全選', 'Copy As Text': '複製為文字', 'Copy As HTML': '複製為 HTML', 'Toggle Skip': '切換跳過', 'Test': '測試', 'No event commands in clipboard to paste.': '剪貼簿中沒有可貼上的事件指令。', 'Variable': '變數', 'Single': '單一', 'Batch': '批次', 'Set': '設定', 'Sub': '減', 'Mul': '乘', 'Div': '除', 'Mod': '取餘', 'Random': '隨機', 'Game Data': '遊戲資料', 'Min:': '最小:', 'Max:': '最大:', 'Member #:': '成員編號:', 'Weapon': '武器', 'Shield': '盾牌', 'Head': '頭部', 'Body': '身體', 'Accessory': '飾品', 'Entire Troop': '整個敵群', 'Player': '玩家', 'This Event': '此事件', 'Wait for Completion': '等待完成', 'frames': '影格', 'Face:': '臉圖:', 'Message:': '訊息:', 'Maximum 4 lines of text': '最多 4 行文字', 'Window Position:': '視窗位置:', 'Preview': '預覽', 'Open in Folder': '在資料夾中開啟', 'Please enter a valid number between 1 and 5000.': '請輸入 1 到 5000 之間的有效數字。' });
Object.assign(RR_TEXT_TRANSLATIONS['zh-Hans'], { 'New': '新建', 'Cut': '剪切', 'Copy': '复制', 'Paste': '粘贴', 'Delete': '删除', 'Select All': '全选', 'Copy As Text': '复制为文本', 'Copy As HTML': '复制为 HTML', 'Toggle Skip': '切换跳过', 'Test': '测试', 'No event commands in clipboard to paste.': '剪贴板中没有可粘贴的事件指令。', 'Variable': '变量', 'Single': '单个', 'Batch': '批量', 'Set': '设置', 'Sub': '减', 'Mul': '乘', 'Div': '除', 'Mod': '取余', 'Random': '随机', 'Game Data': '游戏数据', 'Min:': '最小:', 'Max:': '最大:', 'Member #:': '成员编号:', 'Weapon': '武器', 'Shield': '盾牌', 'Head': '头部', 'Body': '身体', 'Accessory': '饰品', 'Entire Troop': '整个敌群', 'Player': '玩家', 'This Event': '此事件', 'Wait for Completion': '等待完成', 'frames': '帧', 'Face:': '脸图:', 'Message:': '消息:', 'Maximum 4 lines of text': '最多 4 行文本', 'Window Position:': '窗口位置:', 'Preview': '预览', 'Open in Folder': '在文件夹中打开', 'Please enter a valid number between 1 and 5000.': '请输入 1 到 5000 之间的有效数字。' });
Object.assign(RR_TEXT_TRANSLATIONS.ru, { 'New': 'Новый', 'Cut': 'Вырезать', 'Copy': 'Копировать', 'Paste': 'Вставить', 'Delete': 'Удалить', 'Select All': 'Выбрать Всё', 'Copy As Text': 'Копировать Как Текст', 'Copy As HTML': 'Копировать Как HTML', 'Toggle Skip': 'Переключить Пропуск', 'Test': 'Тест', 'No event commands in clipboard to paste.': 'В буфере нет команд события для вставки.', 'Variable': 'Переменная', 'Single': 'Один', 'Batch': 'Диапазон', 'Set': 'Задать', 'Sub': 'Вычесть', 'Mul': 'Умножить', 'Div': 'Разделить', 'Mod': 'Остаток', 'Random': 'Случайно', 'Game Data': 'Данные Игры', 'Min:': 'Мин:', 'Max:': 'Макс:', 'Member #:': 'Участник №:', 'Weapon': 'Оружие', 'Shield': 'Щит', 'Head': 'Голова', 'Body': 'Тело', 'Accessory': 'Аксессуар', 'Entire Troop': 'Вся Группа Врагов', 'Player': 'Игрок', 'This Event': 'Это Событие', 'Wait for Completion': 'Ждать Завершения', 'frames': 'кадров', 'Face:': 'Лицо:', 'Message:': 'Сообщение:', 'Maximum 4 lines of text': 'Максимум 4 строки текста', 'Window Position:': 'Позиция Окна:', 'Preview': 'Предпросмотр', 'Open in Folder': 'Открыть В Папке', 'Please enter a valid number between 1 and 5000.': 'Введите допустимое число от 1 до 5000.' });
Object.assign(RR_TEXT_TRANSLATIONS.pt, { 'New': 'Novo', 'Cut': 'Recortar', 'Copy': 'Copiar', 'Paste': 'Colar', 'Delete': 'Excluir', 'Select All': 'Selecionar Tudo', 'Copy As Text': 'Copiar Como Texto', 'Copy As HTML': 'Copiar Como HTML', 'Toggle Skip': 'Alternar Pular', 'Test': 'Testar', 'No event commands in clipboard to paste.': 'Não há comandos de evento na área de transferência.', 'Variable': 'Variável', 'Single': 'Único', 'Batch': 'Lote', 'Set': 'Definir', 'Sub': 'Subtrair', 'Mul': 'Multiplicar', 'Div': 'Dividir', 'Mod': 'Módulo', 'Random': 'Aleatório', 'Game Data': 'Dados Do Jogo', 'Min:': 'Mín:', 'Max:': 'Máx:', 'Member #:': 'Membro Nº:', 'Weapon': 'Arma', 'Shield': 'Escudo', 'Head': 'Cabeça', 'Body': 'Corpo', 'Accessory': 'Acessório', 'Entire Troop': 'Grupo Inteiro', 'Player': 'Jogador', 'This Event': 'Este Evento', 'Wait for Completion': 'Aguardar Conclusão', 'frames': 'quadros', 'Face:': 'Rosto:', 'Message:': 'Mensagem:', 'Maximum 4 lines of text': 'Máximo de 4 linhas de texto', 'Window Position:': 'Posição Da Janela:', 'Preview': 'Prévia', 'Open in Folder': 'Abrir Na Pasta', 'Please enter a valid number between 1 and 5000.': 'Digite um número válido entre 1 e 5000.' });

Object.assign(RR_TEXT_TRANSLATIONS.ja, { 'Self Switch:': 'セルフスイッチ:', 'Set to:': '設定値:', 'ON': 'ON', 'OFF': 'OFF', 'Remove': '解除', 'State:': 'ステート:', 'Show Level Up': 'レベルアップ表示', 'Char File:': 'キャラファイル:', 'Char Index:': 'キャラ番号:', 'Face File:': '顔ファイル:', 'Face Index:': '顔番号:', 'Battler File:': 'バトラーファイル:', 'Transform Into:': '変身先:', 'Comment Text:': '注釈テキスト:', 'Comments are only visible in the event editor and are not shown during gameplay.': '注釈はイベントエディター内でのみ表示され、ゲーム中には表示されません。', 'Character:': 'キャラクター:', 'Animation:': 'アニメーション:', 'Max Chars:': '最大文字数:', 'Equipment:': '装備:', 'Slot:': 'スロット:', 'Location Type:': '位置タイプ:', 'Variables': '変数', 'Exchange': '交換', 'Exchange positions with another event': '別のイベントと位置を交換します', 'Map ID:': 'マップID:', 'Event ID:': 'イベントID:', 'X:': 'X:', 'Y:': 'Y:', 'X Variable:': 'X変数:', 'Y Variable:': 'Y変数:', 'Direction:': '向き:', 'Retain': '維持', 'Vehicle:': '乗り物:', 'Boat': '小型船', 'Ship': '大型船', 'Airship': '飛行船', 'Designation:': '指定方法:', 'Direct': '直接指定', 'Map ID Var:': 'マップID変数:', 'X Var:': 'X変数:', 'Y Var:': 'Y変数:', 'Info Type:': '情報タイプ:', 'Terrain Tag': '地形タグ', 'Tile ID (Layer 1)': 'タイルID（レイヤー1）', 'Tile ID (Layer 2)': 'タイルID（レイヤー2）', 'Tile ID (Layer 3)': 'タイルID（レイヤー3）', 'Tile ID (Layer 4)': 'タイルID（レイヤー4）', 'Region ID': 'リージョンID', '1: Slowest': '1: 最も遅い', '2: Slower': '2: 遅い', '3: Slow': '3: やや遅い', '4: Normal': '4: 通常', '5: Fast': '5: 速い', '6: Fastest': '6: 最も速い', 'Window': 'ウィンドウ', 'Dim': '暗くする', 'Transparent': '透明', 'Top': '上', 'Middle': '中', 'Bottom': '下' });
Object.assign(RR_TEXT_TRANSLATIONS.es, { 'Self Switch:': 'Interruptor local:', 'Set to:': 'Establecer en:', 'ON': 'ON', 'OFF': 'OFF', 'Remove': 'Quitar', 'State:': 'Estado:', 'Show Level Up': 'Mostrar subida de nivel', 'Char File:': 'Archivo char:', 'Char Index:': 'Índice char:', 'Face File:': 'Archivo rostro:', 'Face Index:': 'Índice rostro:', 'Battler File:': 'Archivo battler:', 'Transform Into:': 'Transformar en:', 'Comment Text:': 'Texto de comentario:', 'Comments are only visible in the event editor and are not shown during gameplay.': 'Los comentarios solo se ven en el editor y no aparecen durante el juego.', 'Character:': 'Personaje:', 'Animation:': 'Animación:', 'Max Chars:': 'Máx. caracteres:', 'Equipment:': 'Equipo:', 'Slot:': 'Ranura:', 'Location Type:': 'Tipo de ubicación:', 'Variables': 'Variables', 'Exchange': 'Intercambio', 'Exchange positions with another event': 'Intercambiar posiciones con otro evento', 'Map ID:': 'ID mapa:', 'Event ID:': 'ID evento:', 'X:': 'X:', 'Y:': 'Y:', 'X Variable:': 'Variable X:', 'Y Variable:': 'Variable Y:', 'Direction:': 'Dirección:', 'Retain': 'Mantener', 'Vehicle:': 'Vehículo:', 'Boat': 'Bote', 'Ship': 'Barco', 'Airship': 'Aeronave', 'Designation:': 'Designación:', 'Direct': 'Directo', 'Map ID Var:': 'Var. ID mapa:', 'X Var:': 'Var. X:', 'Y Var:': 'Var. Y:', 'Info Type:': 'Tipo de info:', 'Terrain Tag': 'Etiqueta de terreno', 'Tile ID (Layer 1)': 'ID de tile (capa 1)', 'Tile ID (Layer 2)': 'ID de tile (capa 2)', 'Tile ID (Layer 3)': 'ID de tile (capa 3)', 'Tile ID (Layer 4)': 'ID de tile (capa 4)', 'Region ID': 'ID de región', '1: Slowest': '1: Muy lento', '2: Slower': '2: Más lento', '3: Slow': '3: Lento', '4: Normal': '4: Normal', '5: Fast': '5: Rápido', '6: Fastest': '6: Muy rápido', 'Window': 'Ventana', 'Dim': 'Oscuro', 'Transparent': 'Transparente', 'Top': 'Arriba', 'Middle': 'Medio', 'Bottom': 'Abajo' });
Object.assign(RR_TEXT_TRANSLATIONS['zh-Hant'], { 'Self Switch:': '自開關:', 'Set to:': '設定為:', 'ON': 'ON', 'OFF': 'OFF', 'Remove': '移除', 'State:': '狀態:', 'Show Level Up': '顯示升級', 'Char File:': '角色檔案:', 'Char Index:': '角色索引:', 'Face File:': '臉圖檔案:', 'Face Index:': '臉圖索引:', 'Battler File:': '戰鬥圖檔案:', 'Transform Into:': '變身為:', 'Comment Text:': '註解文字:', 'Comments are only visible in the event editor and are not shown during gameplay.': '註解只會在事件編輯器中顯示，遊戲中不會顯示。', 'Character:': '角色:', 'Animation:': '動畫:', 'Max Chars:': '最大字元:', 'Equipment:': '裝備:', 'Slot:': '欄位:', 'Location Type:': '位置類型:', 'Variables': '變數', 'Exchange': '交換', 'Exchange positions with another event': '與另一個事件交換位置', 'Map ID:': '地圖 ID:', 'Event ID:': '事件 ID:', 'X:': 'X:', 'Y:': 'Y:', 'X Variable:': 'X 變數:', 'Y Variable:': 'Y 變數:', 'Direction:': '方向:', 'Retain': '保持', 'Vehicle:': '載具:', 'Boat': '小船', 'Ship': '大船', 'Airship': '飛空艇', 'Designation:': '指定方式:', 'Direct': '直接', 'Map ID Var:': '地圖 ID 變數:', 'X Var:': 'X 變數:', 'Y Var:': 'Y 變數:', 'Info Type:': '資訊類型:', 'Terrain Tag': '地形標籤', 'Tile ID (Layer 1)': '圖塊 ID（圖層 1）', 'Tile ID (Layer 2)': '圖塊 ID（圖層 2）', 'Tile ID (Layer 3)': '圖塊 ID（圖層 3）', 'Tile ID (Layer 4)': '圖塊 ID（圖層 4）', 'Region ID': '區域 ID', '1: Slowest': '1: 最慢', '2: Slower': '2: 較慢', '3: Slow': '3: 慢', '4: Normal': '4: 正常', '5: Fast': '5: 快', '6: Fastest': '6: 最快', 'Window': '視窗', 'Dim': '變暗', 'Transparent': '透明', 'Top': '上', 'Middle': '中', 'Bottom': '下' });
Object.assign(RR_TEXT_TRANSLATIONS['zh-Hans'], { 'Self Switch:': '自开关:', 'Set to:': '设置为:', 'ON': 'ON', 'OFF': 'OFF', 'Remove': '移除', 'State:': '状态:', 'Show Level Up': '显示升级', 'Char File:': '角色文件:', 'Char Index:': '角色索引:', 'Face File:': '脸图文件:', 'Face Index:': '脸图索引:', 'Battler File:': '战斗图文件:', 'Transform Into:': '变身为:', 'Comment Text:': '注释文本:', 'Comments are only visible in the event editor and are not shown during gameplay.': '注释只会在事件编辑器中显示，游戏中不会显示。', 'Character:': '角色:', 'Animation:': '动画:', 'Max Chars:': '最大字符:', 'Equipment:': '装备:', 'Slot:': '栏位:', 'Location Type:': '位置类型:', 'Variables': '变量', 'Exchange': '交换', 'Exchange positions with another event': '与另一个事件交换位置', 'Map ID:': '地图 ID:', 'Event ID:': '事件 ID:', 'X:': 'X:', 'Y:': 'Y:', 'X Variable:': 'X 变量:', 'Y Variable:': 'Y 变量:', 'Direction:': '方向:', 'Retain': '保持', 'Vehicle:': '载具:', 'Boat': '小船', 'Ship': '大船', 'Airship': '飞空艇', 'Designation:': '指定方式:', 'Direct': '直接', 'Map ID Var:': '地图 ID 变量:', 'X Var:': 'X 变量:', 'Y Var:': 'Y 变量:', 'Info Type:': '信息类型:', 'Terrain Tag': '地形标签', 'Tile ID (Layer 1)': '图块 ID（图层 1）', 'Tile ID (Layer 2)': '图块 ID（图层 2）', 'Tile ID (Layer 3)': '图块 ID（图层 3）', 'Tile ID (Layer 4)': '图块 ID（图层 4）', 'Region ID': '区域 ID', '1: Slowest': '1: 最慢', '2: Slower': '2: 较慢', '3: Slow': '3: 慢', '4: Normal': '4: 正常', '5: Fast': '5: 快', '6: Fastest': '6: 最快', 'Window': '窗口', 'Dim': '变暗', 'Transparent': '透明', 'Top': '上', 'Middle': '中', 'Bottom': '下' });
Object.assign(RR_TEXT_TRANSLATIONS.ru, { 'Self Switch:': 'Локальный Переключатель:', 'Set to:': 'Задать:', 'ON': 'ВКЛ', 'OFF': 'ВЫКЛ', 'Remove': 'Удалить', 'State:': 'Состояние:', 'Show Level Up': 'Показать Повышение Уровня', 'Char File:': 'Файл Персонажа:', 'Char Index:': 'Индекс Персонажа:', 'Face File:': 'Файл Лица:', 'Face Index:': 'Индекс Лица:', 'Battler File:': 'Файл Бойца:', 'Transform Into:': 'Превратить В:', 'Comment Text:': 'Текст Комментария:', 'Comments are only visible in the event editor and are not shown during gameplay.': 'Комментарии видны только в редакторе событий и не показываются в игре.', 'Character:': 'Персонаж:', 'Animation:': 'Анимация:', 'Max Chars:': 'Макс. Символов:', 'Equipment:': 'Экипировка:', 'Slot:': 'Слот:', 'Location Type:': 'Тип Положения:', 'Variables': 'Переменные', 'Exchange': 'Обмен', 'Exchange positions with another event': 'Обменять позиции с другим событием', 'Map ID:': 'ID Карты:', 'Event ID:': 'ID События:', 'X:': 'X:', 'Y:': 'Y:', 'X Variable:': 'Переменная X:', 'Y Variable:': 'Переменная Y:', 'Direction:': 'Направление:', 'Retain': 'Сохранить', 'Vehicle:': 'Транспорт:', 'Boat': 'Лодка', 'Ship': 'Корабль', 'Airship': 'Дирижабль', 'Designation:': 'Назначение:', 'Direct': 'Напрямую', 'Map ID Var:': 'Перем. ID Карты:', 'X Var:': 'Перем. X:', 'Y Var:': 'Перем. Y:', 'Info Type:': 'Тип Инфо:', 'Terrain Tag': 'Тег Местности', 'Tile ID (Layer 1)': 'ID Тайла (Слой 1)', 'Tile ID (Layer 2)': 'ID Тайла (Слой 2)', 'Tile ID (Layer 3)': 'ID Тайла (Слой 3)', 'Tile ID (Layer 4)': 'ID Тайла (Слой 4)', 'Region ID': 'ID Региона', '1: Slowest': '1: Самая Медленная', '2: Slower': '2: Медленнее', '3: Slow': '3: Медленно', '4: Normal': '4: Нормально', '5: Fast': '5: Быстро', '6: Fastest': '6: Самая Быстрая', 'Window': 'Окно', 'Dim': 'Затемнение', 'Transparent': 'Прозрачно', 'Top': 'Вверху', 'Middle': 'Посередине', 'Bottom': 'Внизу' });
Object.assign(RR_TEXT_TRANSLATIONS.pt, { 'Self Switch:': 'Interruptor Local:', 'Set to:': 'Definir para:', 'ON': 'ON', 'OFF': 'OFF', 'Remove': 'Remover', 'State:': 'Estado:', 'Show Level Up': 'Mostrar Subida De Nível', 'Char File:': 'Arquivo Char:', 'Char Index:': 'Índice Char:', 'Face File:': 'Arquivo De Rosto:', 'Face Index:': 'Índice De Rosto:', 'Battler File:': 'Arquivo De Batalha:', 'Transform Into:': 'Transformar Em:', 'Comment Text:': 'Texto Do Comentário:', 'Comments are only visible in the event editor and are not shown during gameplay.': 'Comentários só aparecem no editor de eventos e não são mostrados durante o jogo.', 'Character:': 'Personagem:', 'Animation:': 'Animação:', 'Max Chars:': 'Máx. Caracteres:', 'Equipment:': 'Equipamento:', 'Slot:': 'Espaço:', 'Location Type:': 'Tipo De Local:', 'Variables': 'Variáveis', 'Exchange': 'Trocar', 'Exchange positions with another event': 'Trocar posições com outro evento', 'Map ID:': 'ID Do Mapa:', 'Event ID:': 'ID Do Evento:', 'X:': 'X:', 'Y:': 'Y:', 'X Variable:': 'Variável X:', 'Y Variable:': 'Variável Y:', 'Direction:': 'Direção:', 'Retain': 'Manter', 'Vehicle:': 'Veículo:', 'Boat': 'Barco Pequeno', 'Ship': 'Navio', 'Airship': 'Dirigível', 'Designation:': 'Designação:', 'Direct': 'Direto', 'Map ID Var:': 'Var. ID Mapa:', 'X Var:': 'Var. X:', 'Y Var:': 'Var. Y:', 'Info Type:': 'Tipo De Info:', 'Terrain Tag': 'Tag De Terreno', 'Tile ID (Layer 1)': 'ID Do Tile (Camada 1)', 'Tile ID (Layer 2)': 'ID Do Tile (Camada 2)', 'Tile ID (Layer 3)': 'ID Do Tile (Camada 3)', 'Tile ID (Layer 4)': 'ID Do Tile (Camada 4)', 'Region ID': 'ID Da Região', '1: Slowest': '1: Mais Lento', '2: Slower': '2: Mais Devagar', '3: Slow': '3: Devagar', '4: Normal': '4: Normal', '5: Fast': '5: Rápido', '6: Fastest': '6: Mais Rápido', 'Window': 'Janela', 'Dim': 'Escuro', 'Transparent': 'Transparente', 'Top': 'Topo', 'Middle': 'Meio', 'Bottom': 'Baixo' });

Object.assign(RR_TEXT_TRANSLATIONS.ja, { 'Operation': '操作', 'Operand': 'オペランド', 'Add': '加算', 'Constant': '定数', 'Script': 'スクリプト', 'Distance:': '距離:', 'tiles': 'タイル', 'Type:': 'タイプ:', 'Weather Type:': '天候タイプ:', 'Power:': '強さ:', 'None': 'なし', 'Rain': '雨', 'Storm': '嵐', 'Snow': '雪', 'Fadeout': 'フェードアウト', 'Fadein': 'フェードイン', 'Duration is automatically set to the default fade speed.': '時間は既定のフェード速度に自動設定されます。' });
Object.assign(RR_TEXT_TRANSLATIONS.es, { 'Operation': 'Operación', 'Operand': 'Operando', 'Add': 'Sumar', 'Constant': 'Constante', 'Script': 'Código', 'Distance:': 'Distancia:', 'tiles': 'tiles', 'Type:': 'Tipo:', 'Weather Type:': 'Tipo de clima:', 'Power:': 'Potencia:', 'None': 'Ninguno', 'Rain': 'Lluvia', 'Storm': 'Tormenta', 'Snow': 'Nieve', 'Fadeout': 'Desvanecer', 'Fadein': 'Aparecer', 'Duration is automatically set to the default fade speed.': 'La duración se establece automáticamente a la velocidad de fundido predeterminada.' });
Object.assign(RR_TEXT_TRANSLATIONS['zh-Hant'], { 'Operation': '操作', 'Operand': '運算元', 'Add': '加', 'Constant': '常數', 'Script': '腳本', 'Distance:': '距離:', 'tiles': '圖塊', 'Type:': '類型:', 'Weather Type:': '天氣類型:', 'Power:': '強度:', 'None': '無', 'Rain': '雨', 'Storm': '暴風雨', 'Snow': '雪', 'Fadeout': '淡出', 'Fadein': '淡入', 'Duration is automatically set to the default fade speed.': '持續時間會自動設定為預設淡入淡出速度。' });
Object.assign(RR_TEXT_TRANSLATIONS['zh-Hans'], { 'Operation': '操作', 'Operand': '操作数', 'Add': '加', 'Constant': '常量', 'Script': '脚本', 'Distance:': '距离:', 'tiles': '图块', 'Type:': '类型:', 'Weather Type:': '天气类型:', 'Power:': '强度:', 'None': '无', 'Rain': '雨', 'Storm': '暴风雨', 'Snow': '雪', 'Fadeout': '淡出', 'Fadein': '淡入', 'Duration is automatically set to the default fade speed.': '持续时间会自动设置为默认淡入淡出速度。' });
Object.assign(RR_TEXT_TRANSLATIONS.ru, { 'Operation': 'Операция', 'Operand': 'Операнд', 'Add': 'Добавить', 'Constant': 'Константа', 'Script': 'Скрипт', 'Distance:': 'Дистанция:', 'tiles': 'тайлов', 'Type:': 'Тип:', 'Weather Type:': 'Тип Погоды:', 'Power:': 'Сила:', 'None': 'Нет', 'Rain': 'Дождь', 'Storm': 'Буря', 'Snow': 'Снег', 'Fadeout': 'Затемнение', 'Fadein': 'Осветление', 'Duration is automatically set to the default fade speed.': 'Длительность автоматически задаётся стандартной скоростью перехода.' });
Object.assign(RR_TEXT_TRANSLATIONS.pt, { 'Operation': 'Operação', 'Operand': 'Operando', 'Add': 'Adicionar', 'Constant': 'Constante', 'Script': 'Código', 'Distance:': 'Distância:', 'tiles': 'tiles', 'Type:': 'Tipo:', 'Weather Type:': 'Tipo De Clima:', 'Power:': 'Força:', 'None': 'Nenhum', 'Rain': 'Chuva', 'Storm': 'Tempestade', 'Snow': 'Neve', 'Fadeout': 'Escurecer', 'Fadein': 'Clarear', 'Duration is automatically set to the default fade speed.': 'A duração é definida automaticamente para a velocidade padrão de fade.' });

Object.assign(RR_TEXT_TRANSLATIONS.ja, { 'Add': '追加', 'Add Operation': '加算' });
Object.assign(RR_TEXT_TRANSLATIONS.es, { 'Add': 'Agregar', 'Add Operation': 'Sumar' });
Object.assign(RR_TEXT_TRANSLATIONS['zh-Hant'], { 'Add': '新增', 'Add Operation': '加' });
Object.assign(RR_TEXT_TRANSLATIONS['zh-Hans'], { 'Add': '新建', 'Add Operation': '加' });
Object.assign(RR_TEXT_TRANSLATIONS.ru, { 'Add': 'Добавить', 'Add Operation': 'Прибавить' });
Object.assign(RR_TEXT_TRANSLATIONS.pt, { 'Add': 'Adicionar', 'Add Operation': 'Somar' });

Object.assign(RR_TEXT_TRANSLATIONS.ja, { 'When Cancel:': 'キャンセル時:', 'Default:': 'デフォルト:', 'Background:': '背景:', 'Disallow': '禁止', 'Branch': '分岐', 'Choice 1': '選択肢 1', 'Choice 2': '選択肢 2', 'Choice 3': '選択肢 3', 'Choice 4': '選択肢 4', 'Choice 5': '選択肢 5', 'Choice 6': '選択肢 6', 'Fade:': 'フェード:', 'Black': '黒', 'White': '白', 'Item Type:': 'アイテムタイプ:', 'Regular Item': '通常アイテム', 'Key Item': '大事なもの', 'Hidden Item A': '隠しアイテム A', 'Hidden Item B': '隠しアイテム B' });
Object.assign(RR_TEXT_TRANSLATIONS.es, { 'When Cancel:': 'Al cancelar:', 'Default:': 'Predeterminado:', 'Background:': 'Fondo:', 'Disallow': 'No permitir', 'Branch': 'Rama', 'Choice 1': 'Opción 1', 'Choice 2': 'Opción 2', 'Choice 3': 'Opción 3', 'Choice 4': 'Opción 4', 'Choice 5': 'Opción 5', 'Choice 6': 'Opción 6', 'Fade:': 'Fundido:', 'Black': 'Negro', 'White': 'Blanco', 'Item Type:': 'Tipo de objeto:', 'Regular Item': 'Objeto normal', 'Key Item': 'Objeto clave', 'Hidden Item A': 'Objeto oculto A', 'Hidden Item B': 'Objeto oculto B' });
Object.assign(RR_TEXT_TRANSLATIONS['zh-Hant'], { 'When Cancel:': '取消時:', 'Default:': '預設:', 'Background:': '背景:', 'Disallow': '禁止', 'Branch': '分歧', 'Choice 1': '選項 1', 'Choice 2': '選項 2', 'Choice 3': '選項 3', 'Choice 4': '選項 4', 'Choice 5': '選項 5', 'Choice 6': '選項 6', 'Fade:': '淡入淡出:', 'Black': '黑色', 'White': '白色', 'Item Type:': '物品類型:', 'Regular Item': '一般物品', 'Key Item': '重要物品', 'Hidden Item A': '隱藏物品 A', 'Hidden Item B': '隱藏物品 B' });
Object.assign(RR_TEXT_TRANSLATIONS['zh-Hans'], { 'When Cancel:': '取消时:', 'Default:': '默认:', 'Background:': '背景:', 'Disallow': '禁止', 'Branch': '分支', 'Choice 1': '选项 1', 'Choice 2': '选项 2', 'Choice 3': '选项 3', 'Choice 4': '选项 4', 'Choice 5': '选项 5', 'Choice 6': '选项 6', 'Fade:': '淡入淡出:', 'Black': '黑色', 'White': '白色', 'Item Type:': '物品类型:', 'Regular Item': '普通物品', 'Key Item': '重要物品', 'Hidden Item A': '隐藏物品 A', 'Hidden Item B': '隐藏物品 B' });
Object.assign(RR_TEXT_TRANSLATIONS.ru, { 'When Cancel:': 'При Отмене:', 'Default:': 'По Умолчанию:', 'Background:': 'Фон:', 'Disallow': 'Запретить', 'Branch': 'Ветвь', 'Choice 1': 'Выбор 1', 'Choice 2': 'Выбор 2', 'Choice 3': 'Выбор 3', 'Choice 4': 'Выбор 4', 'Choice 5': 'Выбор 5', 'Choice 6': 'Выбор 6', 'Fade:': 'Переход:', 'Black': 'Чёрный', 'White': 'Белый', 'Item Type:': 'Тип Предмета:', 'Regular Item': 'Обычный Предмет', 'Key Item': 'Ключевой Предмет', 'Hidden Item A': 'Скрытый Предмет A', 'Hidden Item B': 'Скрытый Предмет B' });
Object.assign(RR_TEXT_TRANSLATIONS.pt, { 'When Cancel:': 'Ao Cancelar:', 'Default:': 'Padrão:', 'Background:': 'Fundo:', 'Disallow': 'Proibir', 'Branch': 'Ramo', 'Choice 1': 'Escolha 1', 'Choice 2': 'Escolha 2', 'Choice 3': 'Escolha 3', 'Choice 4': 'Escolha 4', 'Choice 5': 'Escolha 5', 'Choice 6': 'Escolha 6', 'Fade:': 'Fade:', 'Black': 'Preto', 'White': 'Branco', 'Item Type:': 'Tipo De Item:', 'Regular Item': 'Item Normal', 'Key Item': 'Item-Chave', 'Hidden Item A': 'Item Oculto A', 'Hidden Item B': 'Item Oculto B' });

Object.assign(RR_TEXT_TRANSLATIONS.ja, { 'Condition Type:': '条件タイプ:', 'Switch': 'スイッチ', 'Self Switch': 'セルフスイッチ', 'Gold': '所持金', 'Item': 'アイテム', 'Armor': '防具', 'Comparison:': '比較:', 'Value:': '値:', 'is:': '状態:', 'Amount:': '金額:', 'Equal to (==)': '等しい (==)', 'Greater or Equal (>=)': '以上 (>=)', 'Less or Equal (<=)': '以下 (<=)', 'Greater than (>)': 'より大きい (>)', 'Less than (<)': 'より小さい (<)', 'Not Equal (!=)': '等しくない (!=)', 'Movement Commands': '移動コマンド' });
Object.assign(RR_TEXT_TRANSLATIONS.es, { 'Condition Type:': 'Tipo de condición:', 'Switch': 'Interruptor', 'Self Switch': 'Interruptor local', 'Gold': 'Oro', 'Item': 'Objeto', 'Armor': 'Armadura', 'Comparison:': 'Comparación:', 'Value:': 'Valor:', 'is:': 'es:', 'Amount:': 'Cantidad:', 'Equal to (==)': 'Igual a (==)', 'Greater or Equal (>=)': 'Mayor o igual (>=)', 'Less or Equal (<=)': 'Menor o igual (<=)', 'Greater than (>)': 'Mayor que (>)', 'Less than (<)': 'Menor que (<)', 'Not Equal (!=)': 'Distinto (!=)', 'Movement Commands': 'Comandos de movimiento' });
Object.assign(RR_TEXT_TRANSLATIONS['zh-Hant'], { 'Condition Type:': '條件類型:', 'Switch': '開關', 'Self Switch': '自開關', 'Gold': '金錢', 'Item': '物品', 'Armor': '防具', 'Comparison:': '比較:', 'Value:': '值:', 'is:': '為:', 'Amount:': '數量:', 'Equal to (==)': '等於 (==)', 'Greater or Equal (>=)': '大於等於 (>=)', 'Less or Equal (<=)': '小於等於 (<=)', 'Greater than (>)': '大於 (>)', 'Less than (<)': '小於 (<)', 'Not Equal (!=)': '不等於 (!=)', 'Movement Commands': '移動指令' });
Object.assign(RR_TEXT_TRANSLATIONS['zh-Hans'], { 'Condition Type:': '条件类型:', 'Switch': '开关', 'Self Switch': '自开关', 'Gold': '金钱', 'Item': '物品', 'Armor': '防具', 'Comparison:': '比较:', 'Value:': '值:', 'is:': '为:', 'Amount:': '数量:', 'Equal to (==)': '等于 (==)', 'Greater or Equal (>=)': '大于等于 (>=)', 'Less or Equal (<=)': '小于等于 (<=)', 'Greater than (>)': '大于 (>)', 'Less than (<)': '小于 (<)', 'Not Equal (!=)': '不等于 (!=)', 'Movement Commands': '移动指令' });
Object.assign(RR_TEXT_TRANSLATIONS.ru, { 'Condition Type:': 'Тип Условия:', 'Switch': 'Переключатель', 'Self Switch': 'Локальный Переключатель', 'Gold': 'Золото', 'Item': 'Предмет', 'Armor': 'Броня', 'Comparison:': 'Сравнение:', 'Value:': 'Значение:', 'is:': 'это:', 'Amount:': 'Количество:', 'Equal to (==)': 'Равно (==)', 'Greater or Equal (>=)': 'Больше Или Равно (>=)', 'Less or Equal (<=)': 'Меньше Или Равно (<=)', 'Greater than (>)': 'Больше (>)', 'Less than (<)': 'Меньше (<)', 'Not Equal (!=)': 'Не Равно (!=)', 'Movement Commands': 'Команды Движения' });
Object.assign(RR_TEXT_TRANSLATIONS.pt, { 'Condition Type:': 'Tipo De Condição:', 'Switch': 'Interruptor', 'Self Switch': 'Interruptor Local', 'Gold': 'Ouro', 'Item': 'Item', 'Armor': 'Armadura', 'Comparison:': 'Comparação:', 'Value:': 'Valor:', 'is:': 'é:', 'Amount:': 'Quantidade:', 'Equal to (==)': 'Igual A (==)', 'Greater or Equal (>=)': 'Maior Ou Igual (>=)', 'Less or Equal (<=)': 'Menor Ou Igual (<=)', 'Greater than (>)': 'Maior Que (>)', 'Less than (<)': 'Menor Que (<)', 'Not Equal (!=)': 'Diferente (!=)', 'Movement Commands': 'Comandos De Movimento' });

Object.assign(RR_TEXT_TRANSLATIONS.ja, { 'Increase': '増やす', 'Decrease': '減らす', 'Amount Type:': '数量タイプ:', 'Add to Party': 'パーティに加える', 'Remove from Party': 'パーティから外す', 'Max HP': '最大HP', 'Max MP': '最大MP', 'Attack': '攻撃力', 'Defense': '防御力', 'M.Attack': '魔法攻撃', 'M.Defense': '魔法防御', 'Agility': '敏捷性', 'Luck': '運', 'Goods:': '商品:', 'Move Down': '下に移動', 'Move Left': '左に移動', 'Move Right': '右に移動', 'Move Up': '上に移動', 'Move Lower L': '左下に移動', 'Move Lower R': '右下に移動', 'Move Upper L': '左上に移動', 'Move Upper R': '右上に移動', 'Move Random': 'ランダムに移動', 'Move toward': '近づく', 'Move away': '遠ざかる', '1 Step Forward': '一歩前進', '1 Step Back': '一歩後退', 'Jump...': 'ジャンプ...', 'Wait...': 'ウェイト...', 'Turn Down': '下を向く', 'Turn Left': '左を向く', 'Turn Right': '右を向く', 'Turn Up': '上を向く', 'Turn 90° R': '右に90°回転', 'Turn 90° L': '左に90°回転', 'Turn 180°': '180°回転', 'Turn 90° R/L': '左右90°回転', 'Turn Random': 'ランダム方向', 'Turn toward': 'こちらを向く', 'Turn away': '反対を向く', 'Switch ON...': 'スイッチON...', 'Switch OFF...': 'スイッチOFF...', 'Change Speed...': '速度変更...', 'Change Freq...': '頻度変更...', 'Walk Anim ON': '歩行アニメON', 'Walk Anim OFF': '歩行アニメOFF', 'Step Anim ON': '足踏みアニメON', 'Step Anim OFF': '足踏みアニメOFF', 'Dir Fix ON': '向き固定ON', 'Dir Fix OFF': '向き固定OFF', 'Through ON': 'すり抜けON', 'Through OFF': 'すり抜けOFF', 'Transparent ON': '透明ON', 'Transparent OFF': '透明OFF', 'Change Image...': '画像変更...', 'Change Opacity...': '不透明度変更...', 'Change Blend...': '合成方法変更...', 'Play SE...': 'SE再生...', 'Script...': 'スクリプト...' });
Object.assign(RR_TEXT_TRANSLATIONS.es, { 'Increase': 'Aumentar', 'Decrease': 'Disminuir', 'Amount Type:': 'Tipo de cantidad:', 'Add to Party': 'Añadir al grupo', 'Remove from Party': 'Quitar del grupo', 'Max HP': 'HP máx.', 'Max MP': 'MP máx.', 'Attack': 'Ataque', 'Defense': 'Defensa', 'M.Attack': 'Ataque M.', 'M.Defense': 'Defensa M.', 'Agility': 'Agilidad', 'Luck': 'Suerte', 'Goods:': 'Mercancías:', 'Move Down': 'Mover abajo', 'Move Left': 'Mover izquierda', 'Move Right': 'Mover derecha', 'Move Up': 'Mover arriba', 'Move Lower L': 'Mover abajo izq.', 'Move Lower R': 'Mover abajo der.', 'Move Upper L': 'Mover arriba izq.', 'Move Upper R': 'Mover arriba der.', 'Move Random': 'Mover aleatorio', 'Move toward': 'Acercarse', 'Move away': 'Alejarse', '1 Step Forward': '1 paso adelante', '1 Step Back': '1 paso atrás', 'Jump...': 'Saltar...', 'Wait...': 'Esperar...', 'Turn Down': 'Mirar abajo', 'Turn Left': 'Mirar izquierda', 'Turn Right': 'Mirar derecha', 'Turn Up': 'Mirar arriba', 'Turn 90° R': 'Girar 90° D', 'Turn 90° L': 'Girar 90° I', 'Turn 180°': 'Girar 180°', 'Turn 90° R/L': 'Girar 90° D/I', 'Turn Random': 'Girar aleatorio', 'Turn toward': 'Mirar hacia', 'Turn away': 'Mirar contrario', 'Switch ON...': 'Interruptor ON...', 'Switch OFF...': 'Interruptor OFF...', 'Change Speed...': 'Cambiar velocidad...', 'Change Freq...': 'Cambiar frecuencia...', 'Walk Anim ON': 'Anim. caminar ON', 'Walk Anim OFF': 'Anim. caminar OFF', 'Step Anim ON': 'Anim. paso ON', 'Step Anim OFF': 'Anim. paso OFF', 'Dir Fix ON': 'Fijar dir. ON', 'Dir Fix OFF': 'Fijar dir. OFF', 'Through ON': 'Atravesar ON', 'Through OFF': 'Atravesar OFF', 'Transparent ON': 'Transparente ON', 'Transparent OFF': 'Transparente OFF', 'Change Image...': 'Cambiar imagen...', 'Change Opacity...': 'Cambiar opacidad...', 'Change Blend...': 'Cambiar mezcla...', 'Play SE...': 'Reproducir SE...', 'Script...': 'Script...' });
Object.assign(RR_TEXT_TRANSLATIONS['zh-Hant'], { 'Increase': '增加', 'Decrease': '減少', 'Amount Type:': '數量類型:', 'Add to Party': '加入隊伍', 'Remove from Party': '移出隊伍', 'Max HP': '最大 HP', 'Max MP': '最大 MP', 'Attack': '攻擊力', 'Defense': '防禦力', 'M.Attack': '魔法攻擊', 'M.Defense': '魔法防禦', 'Agility': '敏捷', 'Luck': '幸運', 'Goods:': '商品:', 'Move Down': '向下移動', 'Move Left': '向左移動', 'Move Right': '向右移動', 'Move Up': '向上移動', 'Move Lower L': '向左下移動', 'Move Lower R': '向右下移動', 'Move Upper L': '向左上移動', 'Move Upper R': '向右上移動', 'Move Random': '隨機移動', 'Move toward': '接近', 'Move away': '遠離', '1 Step Forward': '前進一步', '1 Step Back': '後退一步', 'Jump...': '跳躍...', 'Wait...': '等待...', 'Turn Down': '面向下', 'Turn Left': '面向左', 'Turn Right': '面向右', 'Turn Up': '面向上', 'Turn 90° R': '右轉90°', 'Turn 90° L': '左轉90°', 'Turn 180°': '轉180°', 'Turn 90° R/L': '左右轉90°', 'Turn Random': '隨機轉向', 'Turn toward': '面向目標', 'Turn away': '背向目標', 'Switch ON...': '開關 ON...', 'Switch OFF...': '開關 OFF...', 'Change Speed...': '變更速度...', 'Change Freq...': '變更頻率...', 'Walk Anim ON': '行走動畫 ON', 'Walk Anim OFF': '行走動畫 OFF', 'Step Anim ON': '踏步動畫 ON', 'Step Anim OFF': '踏步動畫 OFF', 'Dir Fix ON': '方向固定 ON', 'Dir Fix OFF': '方向固定 OFF', 'Through ON': '穿透 ON', 'Through OFF': '穿透 OFF', 'Transparent ON': '透明 ON', 'Transparent OFF': '透明 OFF', 'Change Image...': '變更圖像...', 'Change Opacity...': '變更不透明度...', 'Change Blend...': '變更混合...', 'Play SE...': '播放 SE...', 'Script...': '腳本...' });
Object.assign(RR_TEXT_TRANSLATIONS['zh-Hans'], { 'Increase': '增加', 'Decrease': '减少', 'Amount Type:': '数量类型:', 'Add to Party': '加入队伍', 'Remove from Party': '移出队伍', 'Max HP': '最大 HP', 'Max MP': '最大 MP', 'Attack': '攻击力', 'Defense': '防御力', 'M.Attack': '魔法攻击', 'M.Defense': '魔法防御', 'Agility': '敏捷', 'Luck': '幸运', 'Goods:': '商品:', 'Move Down': '向下移动', 'Move Left': '向左移动', 'Move Right': '向右移动', 'Move Up': '向上移动', 'Move Lower L': '向左下移动', 'Move Lower R': '向右下移动', 'Move Upper L': '向左上移动', 'Move Upper R': '向右上移动', 'Move Random': '随机移动', 'Move toward': '接近', 'Move away': '远离', '1 Step Forward': '前进一步', '1 Step Back': '后退一步', 'Jump...': '跳跃...', 'Wait...': '等待...', 'Turn Down': '面向下', 'Turn Left': '面向左', 'Turn Right': '面向右', 'Turn Up': '面向上', 'Turn 90° R': '右转90°', 'Turn 90° L': '左转90°', 'Turn 180°': '转180°', 'Turn 90° R/L': '左右转90°', 'Turn Random': '随机转向', 'Turn toward': '面向目标', 'Turn away': '背向目标', 'Switch ON...': '开关 ON...', 'Switch OFF...': '开关 OFF...', 'Change Speed...': '更改速度...', 'Change Freq...': '更改频率...', 'Walk Anim ON': '行走动画 ON', 'Walk Anim OFF': '行走动画 OFF', 'Step Anim ON': '踏步动画 ON', 'Step Anim OFF': '踏步动画 OFF', 'Dir Fix ON': '方向固定 ON', 'Dir Fix OFF': '方向固定 OFF', 'Through ON': '穿透 ON', 'Through OFF': '穿透 OFF', 'Transparent ON': '透明 ON', 'Transparent OFF': '透明 OFF', 'Change Image...': '更改图像...', 'Change Opacity...': '更改不透明度...', 'Change Blend...': '更改混合...', 'Play SE...': '播放 SE...', 'Script...': '脚本...' });
Object.assign(RR_TEXT_TRANSLATIONS.ru, { 'Increase': 'Увеличить', 'Decrease': 'Уменьшить', 'Amount Type:': 'Тип Количества:', 'Add to Party': 'Добавить В Группу', 'Remove from Party': 'Удалить Из Группы', 'Max HP': 'Макс. HP', 'Max MP': 'Макс. MP', 'Attack': 'Атака', 'Defense': 'Защита', 'M.Attack': 'Маг. Атака', 'M.Defense': 'Маг. Защита', 'Agility': 'Ловкость', 'Luck': 'Удача', 'Goods:': 'Товары:', 'Move Down': 'Двигаться Вниз', 'Move Left': 'Двигаться Влево', 'Move Right': 'Двигаться Вправо', 'Move Up': 'Двигаться Вверх', 'Move Lower L': 'Двигаться Вниз-Влево', 'Move Lower R': 'Двигаться Вниз-Вправо', 'Move Upper L': 'Двигаться Вверх-Влево', 'Move Upper R': 'Двигаться Вверх-Вправо', 'Move Random': 'Двигаться Случайно', 'Move toward': 'Двигаться К Цели', 'Move away': 'Двигаться От Цели', '1 Step Forward': '1 Шаг Вперёд', '1 Step Back': '1 Шаг Назад', 'Jump...': 'Прыжок...', 'Wait...': 'Ожидание...', 'Turn Down': 'Повернуть Вниз', 'Turn Left': 'Повернуть Влево', 'Turn Right': 'Повернуть Вправо', 'Turn Up': 'Повернуть Вверх', 'Turn 90° R': 'Повернуть 90° Вправо', 'Turn 90° L': 'Повернуть 90° Влево', 'Turn 180°': 'Повернуть 180°', 'Turn 90° R/L': 'Повернуть 90° В/Л', 'Turn Random': 'Случайный Поворот', 'Turn toward': 'Повернуться К Цели', 'Turn away': 'Повернуться От Цели', 'Switch ON...': 'Переключатель ВКЛ...', 'Switch OFF...': 'Переключатель ВЫКЛ...', 'Change Speed...': 'Изменить Скорость...', 'Change Freq...': 'Изменить Частоту...', 'Walk Anim ON': 'Анимация Ходьбы ВКЛ', 'Walk Anim OFF': 'Анимация Ходьбы ВЫКЛ', 'Step Anim ON': 'Анимация Шага ВКЛ', 'Step Anim OFF': 'Анимация Шага ВЫКЛ', 'Dir Fix ON': 'Фикс. Напр. ВКЛ', 'Dir Fix OFF': 'Фикс. Напр. ВЫКЛ', 'Through ON': 'Проходимость ВКЛ', 'Through OFF': 'Проходимость ВЫКЛ', 'Transparent ON': 'Прозрачность ВКЛ', 'Transparent OFF': 'Прозрачность ВЫКЛ', 'Change Image...': 'Изменить Изображение...', 'Change Opacity...': 'Изменить Непрозрачность...', 'Change Blend...': 'Изменить Смешивание...', 'Play SE...': 'Играть SE...', 'Script...': 'Скрипт...' });
Object.assign(RR_TEXT_TRANSLATIONS.pt, { 'Increase': 'Aumentar', 'Decrease': 'Diminuir', 'Amount Type:': 'Tipo De Quantidade:', 'Add to Party': 'Adicionar Ao Grupo', 'Remove from Party': 'Remover Do Grupo', 'Max HP': 'HP Máx.', 'Max MP': 'MP Máx.', 'Attack': 'Ataque', 'Defense': 'Defesa', 'M.Attack': 'Ataque M.', 'M.Defense': 'Defesa M.', 'Agility': 'Agilidade', 'Luck': 'Sorte', 'Goods:': 'Mercadorias:', 'Move Down': 'Mover Baixo', 'Move Left': 'Mover Esquerda', 'Move Right': 'Mover Direita', 'Move Up': 'Mover Cima', 'Move Lower L': 'Mover Baixo Esq.', 'Move Lower R': 'Mover Baixo Dir.', 'Move Upper L': 'Mover Cima Esq.', 'Move Upper R': 'Mover Cima Dir.', 'Move Random': 'Mover Aleatório', 'Move toward': 'Mover Para Alvo', 'Move away': 'Mover Para Longe', '1 Step Forward': '1 Passo À Frente', '1 Step Back': '1 Passo Atrás', 'Jump...': 'Pular...', 'Wait...': 'Esperar...', 'Turn Down': 'Virar Baixo', 'Turn Left': 'Virar Esquerda', 'Turn Right': 'Virar Direita', 'Turn Up': 'Virar Cima', 'Turn 90° R': 'Virar 90° D', 'Turn 90° L': 'Virar 90° E', 'Turn 180°': 'Virar 180°', 'Turn 90° R/L': 'Virar 90° D/E', 'Turn Random': 'Virar Aleatório', 'Turn toward': 'Virar Para Alvo', 'Turn away': 'Virar Para Longe', 'Switch ON...': 'Interruptor ON...', 'Switch OFF...': 'Interruptor OFF...', 'Change Speed...': 'Alterar Velocidade...', 'Change Freq...': 'Alterar Frequência...', 'Walk Anim ON': 'Anim. Caminhar ON', 'Walk Anim OFF': 'Anim. Caminhar OFF', 'Step Anim ON': 'Anim. Passo ON', 'Step Anim OFF': 'Anim. Passo OFF', 'Dir Fix ON': 'Fixar Dir. ON', 'Dir Fix OFF': 'Fixar Dir. OFF', 'Through ON': 'Atravessar ON', 'Through OFF': 'Atravessar OFF', 'Transparent ON': 'Transparente ON', 'Transparent OFF': 'Transparente OFF', 'Change Image...': 'Alterar Imagem...', 'Change Opacity...': 'Alterar Opacidade...', 'Change Blend...': 'Alterar Mescla...', 'Play SE...': 'Reproduzir SE...', 'Script...': 'Script...' });

Object.assign(RR_TEXT_TRANSLATIONS.ja, { 'Origin:': '原点:', 'Position:': '位置:', 'Blend Mode:': '合成方法:', 'Upper Left': '左上', 'Center': '中央', 'Direct Designation': '直接指定', 'Designation with Variables': '変数で指定', 'Normal': '通常', 'Additive': '加算', 'Multiply': '乗算', 'Screen': 'スクリーン', 'Repeat Movements': '動作を繰り返す', 'Skip If Cannot Move': '移動できない場合は飛ばす', 'X Offset:': 'X オフセット:', 'Y Offset:': 'Y オフセット:', 'Frames:': 'フレーム:', 'Speed:': '速度:', 'Frequency:': '頻度:', 'Opacity:': '不透明度:', 'Range: 0 (transparent) to 255 (opaque)': '範囲: 0（透明）から255（不透明）', 'File:': 'ファイル:', 'Volume:': '音量:', 'Pitch:': 'ピッチ:', 'Pan:': 'パン:', '1: x8 Slower': '1: 8倍遅い', '2: x4 Slower': '2: 4倍遅い', '3: x2 Slower': '3: 2倍遅い', '4: Normal': '4: 通常', '5: x2 Faster': '5: 2倍速い', '6: x4 Faster': '6: 4倍速い', '1: Lowest': '1: 最低', '2: Lower': '2: 低い', '3: Normal': '3: 通常', '4: Higher': '4: 高い', '5: Highest': '5: 最高' });
Object.assign(RR_TEXT_TRANSLATIONS.es, { 'Origin:': 'Origen:', 'Position:': 'Posición:', 'Blend Mode:': 'Modo de mezcla:', 'Upper Left': 'Superior izquierda', 'Center': 'Centro', 'Direct Designation': 'Designación directa', 'Designation with Variables': 'Designación con variables', 'Normal': 'Normal', 'Additive': 'Aditivo', 'Multiply': 'Multiplicar', 'Screen': 'Pantalla', 'Repeat Movements': 'Repetir movimientos', 'Skip If Cannot Move': 'Saltar si no puede moverse', 'X Offset:': 'Desplaz. X:', 'Y Offset:': 'Desplaz. Y:', 'Frames:': 'Fotogramas:', 'Speed:': 'Velocidad:', 'Frequency:': 'Frecuencia:', 'Opacity:': 'Opacidad:', 'Range: 0 (transparent) to 255 (opaque)': 'Rango: 0 (transparente) a 255 (opaco)', 'File:': 'Archivo:', 'Volume:': 'Volumen:', 'Pitch:': 'Tono:', 'Pan:': 'Pan:', '1: x8 Slower': '1: x8 más lento', '2: x4 Slower': '2: x4 más lento', '3: x2 Slower': '3: x2 más lento', '4: Normal': '4: Normal', '5: x2 Faster': '5: x2 más rápido', '6: x4 Faster': '6: x4 más rápido', '1: Lowest': '1: Mínima', '2: Lower': '2: Baja', '3: Normal': '3: Normal', '4: Higher': '4: Alta', '5: Highest': '5: Máxima' });
Object.assign(RR_TEXT_TRANSLATIONS['zh-Hant'], { 'Origin:': '原點:', 'Position:': '位置:', 'Blend Mode:': '混合模式:', 'Upper Left': '左上', 'Center': '中央', 'Direct Designation': '直接指定', 'Designation with Variables': '使用變數指定', 'Normal': '正常', 'Additive': '加算', 'Multiply': '相乘', 'Screen': '濾色', 'Repeat Movements': '重複移動', 'Skip If Cannot Move': '無法移動時跳過', 'X Offset:': 'X 偏移:', 'Y Offset:': 'Y 偏移:', 'Frames:': '影格:', 'Speed:': '速度:', 'Frequency:': '頻率:', 'Opacity:': '不透明度:', 'Range: 0 (transparent) to 255 (opaque)': '範圍: 0（透明）到 255（不透明）', 'File:': '檔案:', 'Volume:': '音量:', 'Pitch:': '音高:', 'Pan:': '聲像:', '1: x8 Slower': '1: 慢 8 倍', '2: x4 Slower': '2: 慢 4 倍', '3: x2 Slower': '3: 慢 2 倍', '4: Normal': '4: 正常', '5: x2 Faster': '5: 快 2 倍', '6: x4 Faster': '6: 快 4 倍', '1: Lowest': '1: 最低', '2: Lower': '2: 較低', '3: Normal': '3: 正常', '4: Higher': '4: 較高', '5: Highest': '5: 最高' });
Object.assign(RR_TEXT_TRANSLATIONS['zh-Hans'], { 'Origin:': '原点:', 'Position:': '位置:', 'Blend Mode:': '混合模式:', 'Upper Left': '左上', 'Center': '中央', 'Direct Designation': '直接指定', 'Designation with Variables': '使用变量指定', 'Normal': '正常', 'Additive': '加算', 'Multiply': '相乘', 'Screen': '滤色', 'Repeat Movements': '重复移动', 'Skip If Cannot Move': '无法移动时跳过', 'X Offset:': 'X 偏移:', 'Y Offset:': 'Y 偏移:', 'Frames:': '帧:', 'Speed:': '速度:', 'Frequency:': '频率:', 'Opacity:': '不透明度:', 'Range: 0 (transparent) to 255 (opaque)': '范围: 0（透明）到 255（不透明）', 'File:': '文件:', 'Volume:': '音量:', 'Pitch:': '音高:', 'Pan:': '声像:', '1: x8 Slower': '1: 慢 8 倍', '2: x4 Slower': '2: 慢 4 倍', '3: x2 Slower': '3: 慢 2 倍', '4: Normal': '4: 正常', '5: x2 Faster': '5: 快 2 倍', '6: x4 Faster': '6: 快 4 倍', '1: Lowest': '1: 最低', '2: Lower': '2: 较低', '3: Normal': '3: 正常', '4: Higher': '4: 较高', '5: Highest': '5: 最高' });
Object.assign(RR_TEXT_TRANSLATIONS.ru, { 'Origin:': 'Начало:', 'Position:': 'Позиция:', 'Blend Mode:': 'Режим Смешивания:', 'Upper Left': 'Верхний Левый', 'Center': 'Центр', 'Direct Designation': 'Прямое Назначение', 'Designation with Variables': 'Назначение Переменными', 'Normal': 'Обычный', 'Additive': 'Добавление', 'Multiply': 'Умножение', 'Screen': 'Экран', 'Repeat Movements': 'Повторять Движения', 'Skip If Cannot Move': 'Пропустить Если Нельзя Двигаться', 'X Offset:': 'Смещение X:', 'Y Offset:': 'Смещение Y:', 'Frames:': 'Кадры:', 'Speed:': 'Скорость:', 'Frequency:': 'Частота:', 'Opacity:': 'Непрозрачность:', 'Range: 0 (transparent) to 255 (opaque)': 'Диапазон: 0 (прозрачно) до 255 (непрозрачно)', 'File:': 'Файл:', 'Volume:': 'Громкость:', 'Pitch:': 'Высота:', 'Pan:': 'Панорама:', '1: x8 Slower': '1: x8 Медленнее', '2: x4 Slower': '2: x4 Медленнее', '3: x2 Slower': '3: x2 Медленнее', '4: Normal': '4: Обычно', '5: x2 Faster': '5: x2 Быстрее', '6: x4 Faster': '6: x4 Быстрее', '1: Lowest': '1: Самая Низкая', '2: Lower': '2: Ниже', '3: Normal': '3: Обычно', '4: Higher': '4: Выше', '5: Highest': '5: Самая Высокая' });
Object.assign(RR_TEXT_TRANSLATIONS.pt, { 'Origin:': 'Origem:', 'Position:': 'Posição:', 'Blend Mode:': 'Modo De Mescla:', 'Upper Left': 'Superior Esquerdo', 'Center': 'Centro', 'Direct Designation': 'Designação Direta', 'Designation with Variables': 'Designação Com Variáveis', 'Normal': 'Normal', 'Additive': 'Aditivo', 'Multiply': 'Multiplicar', 'Screen': 'Tela', 'Repeat Movements': 'Repetir Movimentos', 'Skip If Cannot Move': 'Pular Se Não Puder Mover', 'X Offset:': 'Desloc. X:', 'Y Offset:': 'Desloc. Y:', 'Frames:': 'Quadros:', 'Speed:': 'Velocidade:', 'Frequency:': 'Frequência:', 'Opacity:': 'Opacidade:', 'Range: 0 (transparent) to 255 (opaque)': 'Intervalo: 0 (transparente) a 255 (opaco)', 'File:': 'Arquivo:', 'Volume:': 'Volume:', 'Pitch:': 'Tom:', 'Pan:': 'Pan:', '1: x8 Slower': '1: x8 Mais Lento', '2: x4 Slower': '2: x4 Mais Lento', '3: x2 Slower': '3: x2 Mais Lento', '4: Normal': '4: Normal', '5: x2 Faster': '5: x2 Mais Rápido', '6: x4 Faster': '6: x4 Mais Rápido', '1: Lowest': '1: Mais Baixa', '2: Lower': '2: Baixa', '3: Normal': '3: Normal', '4: Higher': '4: Alta', '5: Highest': '5: Mais Alta' });

Object.assign(RR_TEXT_TRANSLATIONS.ja, { 'Allow Death': '戦闘不能を許可' });
Object.assign(RR_TEXT_TRANSLATIONS.es, { 'Allow Death': 'Permitir muerte' });
Object.assign(RR_TEXT_TRANSLATIONS['zh-Hant'], { 'Allow Death': '允許死亡' });
Object.assign(RR_TEXT_TRANSLATIONS['zh-Hans'], { 'Allow Death': '允许死亡' });
Object.assign(RR_TEXT_TRANSLATIONS.ru, { 'Allow Death': 'Разрешить смерть' });
Object.assign(RR_TEXT_TRANSLATIONS.pt, { 'Allow Death': 'Permitir Morte' });

Object.assign(RR_TEXT_TRANSLATIONS.de, {
    'Name': 'Name', 'Name:': 'Name:', 'Description': 'Beschreibung', 'Description:': 'Beschreibung:', 'Icon': 'Icon', 'Icon:': 'Icon:', 'Price': 'Preis', 'Price:': 'Preis:', 'Type': 'Typ', 'Type:': 'Typ:', 'Scope': 'Zielbereich', 'Scope:': 'Zielbereich:', 'Occasion': 'Anlass', 'Occasion:': 'Anlass:', 'Speed': 'Geschwindigkeit', 'Speed:': 'Geschwindigkeit:', 'Success Rate': 'Erfolgsrate', 'Success Rate:': 'Erfolgsrate:', 'Repeats': 'Wiederholungen', 'Repeats:': 'Wiederholungen:', 'Hit Type': 'Treffertyp', 'Hit Type:': 'Treffertyp:', 'Animation ID': 'Animations-ID', 'Animation ID:': 'Animations-ID:', 'Damage': 'Schaden', 'Effects': 'Effekte', 'Traits': 'Merkmale', 'Note': 'Notiz',
    'Add': 'Hinzufügen', 'Add Operation': 'Addieren', 'Edit': 'Bearbeiten', 'Browse': 'Durchsuchen', 'Browse...': 'Durchsuchen...', 'Fixed': 'Fest', 'Variable': 'Variable', 'Variables': 'Variablen', 'Constant': 'Konstante', 'Increase': 'Erhöhen', 'Decrease': 'Verringern', 'Remove': 'Entfernen', 'None': 'Keine', 'OK': 'OK', 'Cancel': 'Abbrechen', 'Clear': 'Leeren', 'Play': 'Abspielen', 'Stop': 'Stopp', 'New': 'Neu', 'Cut': 'Ausschneiden', 'Copy': 'Kopieren', 'Paste': 'Einfügen', 'Delete': 'Löschen', 'Select All': 'Alles auswählen', 'Copy As Text': 'Als Text kopieren', 'Copy As HTML': 'Als HTML kopieren', 'Toggle Skip': 'Überspringen umschalten', 'Test': 'Test',
    'Actor': 'Akteur', 'Actor:': 'Akteur:', 'Enemy': 'Gegner', 'Enemy:': 'Gegner:', 'Skill': 'Fähigkeit', 'Skill:': 'Fähigkeit:', 'Target': 'Ziel', 'Target:': 'Ziel:', 'Character': 'Charakter', 'Character:': 'Charakter:', 'Animation:': 'Animation:', 'Equipment': 'Ausrüstung', 'Equipment:': 'Ausrüstung:', 'Slot': 'Slot', 'Slot:': 'Slot:', 'Weapon': 'Waffe', 'Shield': 'Schild', 'Head': 'Kopf', 'Body': 'Körper', 'Accessory': 'Accessoire', 'Armor': 'Rüstung', 'Item': 'Gegenstand', 'Gold': 'Gold',
    'Operation': 'Operation', 'Operation:': 'Operation:', 'Operand': 'Operand', 'Single': 'Einzeln', 'Batch': 'Bereich', 'Set': 'Setzen', 'Sub': 'Subtrahieren', 'Mul': 'Multiplizieren', 'Div': 'Dividieren', 'Mod': 'Modulo', 'Random': 'Zufall', 'Game Data': 'Spieldaten', 'Min:': 'Min:', 'Max:': 'Max:', 'Amount:': 'Menge:', 'Amount Type:': 'Mengentyp:', 'Value:': 'Wert:', 'Comparison:': 'Vergleich:',
    'Player': 'Spieler', 'This Event': 'Dieses Ereignis', 'Entire Troop': 'Gesamte Truppe', 'Wait for Completion': 'Auf Abschluss warten', 'frames': 'Frames', 'Frame:': 'Frame:', 'seconds': 'Sekunden', 'Start': 'Start', 'Duration:': 'Dauer:', 'Distance:': 'Distanz:', 'tiles': 'Tiles', 'Direction:': 'Richtung:', 'Down': 'Unten', 'Left': 'Links', 'Right': 'Rechts', 'Up': 'Oben', 'Retain': 'Beibehalten',
    'Self Switch:': 'Selbstschalter:', 'Set to:': 'Setzen auf:', 'ON': 'EIN', 'OFF': 'AUS', 'State:': 'Zustand:', 'Switch': 'Schalter', 'Self Switch': 'Selbstschalter', 'Condition Type:': 'Bedingungstyp:', 'Equal to (==)': 'Gleich (==)', 'Greater or Equal (>=)': 'Größer oder gleich (>=)', 'Less or Equal (<=)': 'Kleiner oder gleich (<=)', 'Greater than (>)': 'Größer als (>)', 'Less than (<)': 'Kleiner als (<)', 'Not Equal (!=)': 'Ungleich (!=)', 'is:': 'ist:',
    'Face:': 'Gesicht:', 'Message:': 'Nachricht:', 'Maximum 4 lines of text': 'Maximal 4 Textzeilen', 'Window Position:': 'Fensterposition:', 'Window': 'Fenster', 'Dim': 'Abgedunkelt', 'Transparent': 'Transparent', 'Top': 'Oben', 'Middle': 'Mitte', 'Bottom': 'Unten', 'Preview': 'Vorschau', 'Open in Folder': 'Im Ordner öffnen',
    'When Cancel:': 'Bei Abbruch:', 'Default:': 'Standard:', 'Background:': 'Hintergrund:', 'Disallow': 'Nicht erlauben', 'Branch': 'Verzweigung', 'Choice 1': 'Auswahl 1', 'Choice 2': 'Auswahl 2', 'Choice 3': 'Auswahl 3', 'Choice 4': 'Auswahl 4', 'Choice 5': 'Auswahl 5', 'Choice 6': 'Auswahl 6', 'Fade:': 'Überblendung:', 'Black': 'Schwarz', 'White': 'Weiß',
    'Item Type': 'Gegenstandstyp', 'Item Type:': 'Gegenstandstyp:', 'Regular Item': 'Normaler Gegenstand', 'Key Item': 'Schlüsselgegenstand', 'Hidden Item A': 'Versteckter Gegenstand A', 'Hidden Item B': 'Versteckter Gegenstand B', 'Consumable': 'Verbrauchbar', 'Kind:': 'Art:',
    'Location Type:': 'Positionstyp:', 'Exchange': 'Tauschen', 'Exchange positions with another event': 'Positionen mit einem anderen Ereignis tauschen', 'Map ID:': 'Karten-ID:', 'Event ID:': 'Ereignis-ID:', 'X:': 'X:', 'Y:': 'Y:', 'X Variable:': 'X-Variable:', 'Y Variable:': 'Y-Variable:', 'Designation:': 'Festlegung:', 'Direct': 'Direkt', 'Map ID Var:': 'Karten-ID-Var:', 'X Var:': 'X-Var:', 'Y Var:': 'Y-Var:',
    'Vehicle:': 'Fahrzeug:', 'Boat': 'Boot', 'Ship': 'Schiff', 'Airship': 'Luftschiff', 'Info Type:': 'Infotyp:', 'Terrain Tag': 'Geländetag', 'Region ID': 'Regions-ID', 'Origin:': 'Ursprung:', 'Position:': 'Position:', 'Blend Mode:': 'Mischmodus:', 'Upper Left': 'Oben links', 'Center': 'Mitte', 'Direct Designation': 'Direkte Festlegung', 'Designation with Variables': 'Festlegung mit Variablen', 'Normal': 'Normal', 'Additive': 'Additiv', 'Multiply': 'Multiplizieren', 'Screen': 'Screen', 'Picture #:': 'Bild Nr.:', 'Enter picture filename': 'Bilddateinamen eingeben',
    'Weather Type:': 'Wettertyp:', 'Power:': 'Stärke:', 'Rain': 'Regen', 'Storm': 'Sturm', 'Snow': 'Schnee', 'Fadeout': 'Ausblenden', 'Fadein': 'Einblenden', 'Allow Death': 'Tod erlauben', 'Show Level Up': 'Levelaufstieg anzeigen', 'Add to Party': 'Zur Gruppe hinzufügen', 'Remove from Party': 'Aus Gruppe entfernen', 'Max HP': 'Max. HP', 'Max MP': 'Max. MP', 'Attack': 'Angriff', 'Defense': 'Verteidigung', 'M.Attack': 'M.Angriff', 'M.Defense': 'M.Verteidigung', 'Agility': 'Agilität', 'Luck': 'Glück',
    'Movement Commands': 'Bewegungsbefehle', 'Repeat Movements': 'Bewegungen wiederholen', 'Skip If Cannot Move': 'Überspringen, wenn Bewegung unmöglich', 'X Offset:': 'X-Versatz:', 'Y Offset:': 'Y-Versatz:', 'Frames:': 'Frames:', 'Frequency:': 'Frequenz:', 'Opacity:': 'Deckkraft:', 'File:': 'Datei:', 'Volume:': 'Lautstärke:', 'Pitch:': 'Tonhöhe:', 'Pan:': 'Panorama:', 'Images': 'Bilder', 'General Settings': 'Allgemeine Einstellungen', 'Parameters': 'Parameter', 'Parameter': 'Parameter', 'Content': 'Inhalt', 'Effect': 'Effekt', 'No traits': 'Keine Merkmale', 'No effects': 'Keine Effekte', 'Messages': 'Nachrichten', 'General': 'Allgemein', 'Recovery': 'Wiederherstellung', 'State': 'Zustand', 'Buff': 'Buff', 'Special': 'Spezial', 'Always': 'Immer', 'Battle Only': 'Nur Kampf', 'Menu Only': 'Nur Menü', 'Never': 'Nie', 'Physical': 'Physisch', 'Magical': 'Magisch'
});

Object.assign(RR_TEXT_TRANSLATIONS.fr, {
    'Name': 'Nom', 'Name:': 'Nom:', 'Description': 'Description', 'Description:': 'Description:', 'Icon': 'Icône', 'Icon:': 'Icône:', 'Price': 'Prix', 'Price:': 'Prix:', 'Type': 'Type', 'Type:': 'Type:', 'Scope': 'Portée', 'Scope:': 'Portée:', 'Occasion': 'Occasion', 'Occasion:': 'Occasion:', 'Speed': 'Vitesse', 'Speed:': 'Vitesse:', 'Success Rate': 'Taux de réussite', 'Success Rate:': 'Taux de réussite:', 'Repeats': 'Répétitions', 'Repeats:': 'Répétitions:', 'Hit Type': 'Type de coup', 'Hit Type:': 'Type de coup:', 'Animation ID': 'ID animation', 'Animation ID:': 'ID animation:', 'Damage': 'Dégâts', 'Effects': 'Effets', 'Traits': 'Traits', 'Note': 'Note',
    'Add': 'Ajouter', 'Add Operation': 'Additionner', 'Edit': 'Modifier', 'Browse': 'Parcourir', 'Browse...': 'Parcourir...', 'Fixed': 'Fixe', 'Variable': 'Variable', 'Variables': 'Variables', 'Constant': 'Constante', 'Increase': 'Augmenter', 'Decrease': 'Diminuer', 'Remove': 'Retirer', 'None': 'Aucun', 'OK': 'OK', 'Cancel': 'Annuler', 'Clear': 'Effacer', 'Play': 'Lire', 'Stop': 'Arrêter', 'New': 'Nouveau', 'Cut': 'Couper', 'Copy': 'Copier', 'Paste': 'Coller', 'Delete': 'Supprimer', 'Select All': 'Tout sélectionner', 'Copy As Text': 'Copier comme texte', 'Copy As HTML': 'Copier comme HTML', 'Toggle Skip': 'Basculer ignorer', 'Test': 'Tester',
    'Actor': 'Acteur', 'Actor:': 'Acteur:', 'Enemy': 'Ennemi', 'Enemy:': 'Ennemi:', 'Skill': 'Compétence', 'Skill:': 'Compétence:', 'Target': 'Cible', 'Target:': 'Cible:', 'Character': 'Personnage', 'Character:': 'Personnage:', 'Animation:': 'Animation:', 'Equipment': 'Équipement', 'Equipment:': 'Équipement:', 'Slot': 'Emplacement', 'Slot:': 'Emplacement:', 'Weapon': 'Arme', 'Shield': 'Bouclier', 'Head': 'Tête', 'Body': 'Corps', 'Accessory': 'Accessoire', 'Armor': 'Armure', 'Item': 'Objet', 'Gold': 'Or',
    'Operation': 'Opération', 'Operation:': 'Opération:', 'Operand': 'Opérande', 'Single': 'Unique', 'Batch': 'Plage', 'Set': 'Définir', 'Sub': 'Soustraire', 'Mul': 'Multiplier', 'Div': 'Diviser', 'Mod': 'Modulo', 'Random': 'Aléatoire', 'Game Data': 'Données du jeu', 'Min:': 'Min:', 'Max:': 'Max:', 'Amount:': 'Quantité:', 'Amount Type:': 'Type de quantité:', 'Value:': 'Valeur:', 'Comparison:': 'Comparaison:',
    'Player': 'Joueur', 'This Event': 'Cet événement', 'Entire Troop': 'Tout le groupe ennemi', 'Wait for Completion': 'Attendre la fin', 'frames': 'images', 'Frame:': 'Image:', 'seconds': 'secondes', 'Start': 'Démarrer', 'Duration:': 'Durée:', 'Distance:': 'Distance:', 'tiles': 'tiles', 'Direction:': 'Direction:', 'Down': 'Bas', 'Left': 'Gauche', 'Right': 'Droite', 'Up': 'Haut', 'Retain': 'Conserver',
    'Self Switch:': 'Interrupteur local:', 'Set to:': 'Définir sur:', 'ON': 'ON', 'OFF': 'OFF', 'State:': 'État:', 'Switch': 'Interrupteur', 'Self Switch': 'Interrupteur local', 'Condition Type:': 'Type de condition:', 'Equal to (==)': 'Égal à (==)', 'Greater or Equal (>=)': 'Supérieur ou égal (>=)', 'Less or Equal (<=)': 'Inférieur ou égal (<=)', 'Greater than (>)': 'Supérieur à (>)', 'Less than (<)': 'Inférieur à (<)', 'Not Equal (!=)': 'Différent (!=)', 'is:': 'est:',
    'Face:': 'Visage:', 'Message:': 'Message:', 'Maximum 4 lines of text': 'Maximum 4 lignes de texte', 'Window Position:': 'Position de fenêtre:', 'Window': 'Fenêtre', 'Dim': 'Sombre', 'Transparent': 'Transparent', 'Top': 'Haut', 'Middle': 'Milieu', 'Bottom': 'Bas', 'Preview': 'Aperçu', 'Open in Folder': 'Ouvrir dans le dossier',
    'When Cancel:': 'À l’annulation:', 'Default:': 'Défaut:', 'Background:': 'Fond:', 'Disallow': 'Interdire', 'Branch': 'Branche', 'Choice 1': 'Choix 1', 'Choice 2': 'Choix 2', 'Choice 3': 'Choix 3', 'Choice 4': 'Choix 4', 'Choice 5': 'Choix 5', 'Choice 6': 'Choix 6', 'Fade:': 'Fondu:', 'Black': 'Noir', 'White': 'Blanc',
    'Item Type': 'Type d’objet', 'Item Type:': 'Type d’objet:', 'Regular Item': 'Objet normal', 'Key Item': 'Objet clé', 'Hidden Item A': 'Objet caché A', 'Hidden Item B': 'Objet caché B', 'Consumable': 'Consommable', 'Kind:': 'Genre:', 'Location Type:': 'Type de position:', 'Exchange': 'Échanger', 'Exchange positions with another event': 'Échanger les positions avec un autre événement', 'Map ID:': 'ID carte:', 'Event ID:': 'ID événement:', 'X Variable:': 'Variable X:', 'Y Variable:': 'Variable Y:', 'Designation:': 'Désignation:', 'Direct': 'Direct',
    'Vehicle:': 'Véhicule:', 'Boat': 'Bateau', 'Ship': 'Navire', 'Airship': 'Aéronef', 'Info Type:': 'Type d’info:', 'Terrain Tag': 'Tag terrain', 'Region ID': 'ID région', 'Origin:': 'Origine:', 'Position:': 'Position:', 'Blend Mode:': 'Mode de mélange:', 'Upper Left': 'Supérieur gauche', 'Center': 'Centre', 'Direct Designation': 'Désignation directe', 'Designation with Variables': 'Désignation avec variables', 'Normal': 'Normal', 'Additive': 'Additif', 'Multiply': 'Multiplier', 'Screen': 'Écran', 'Picture #:': 'Image n°:', 'Enter picture filename': 'Saisir le nom du fichier image',
    'Weather Type:': 'Type de météo:', 'Power:': 'Puissance:', 'Rain': 'Pluie', 'Storm': 'Tempête', 'Snow': 'Neige', 'Fadeout': 'Fondu sortant', 'Fadein': 'Fondu entrant', 'Script': 'Commande script', 'Allow Death': 'Autoriser la mort', 'Show Level Up': 'Afficher la montée de niveau', 'Add to Party': 'Ajouter au groupe', 'Remove from Party': 'Retirer du groupe', 'Max HP': 'HP max', 'Max MP': 'MP max', 'Attack': 'Attaque', 'Defense': 'Défense', 'M.Attack': 'Attaque M.', 'M.Defense': 'Défense M.', 'Agility': 'Agilité', 'Luck': 'Chance',
    'Movement Commands': 'Commandes de mouvement', 'Repeat Movements': 'Répéter les mouvements', 'Skip If Cannot Move': 'Ignorer si déplacement impossible', 'X Offset:': 'Décalage X:', 'Y Offset:': 'Décalage Y:', 'Frames:': 'Images:', 'Frequency:': 'Fréquence:', 'Opacity:': 'Opacité:', 'File:': 'Fichier:', 'Volume:': 'Volume:', 'Pitch:': 'Hauteur:', 'Pan:': 'Panoramique:', 'Images': 'Images', 'General Settings': 'Paramètres généraux', 'Parameters': 'Paramètres', 'Parameter': 'Paramètre', 'Content': 'Contenu', 'Effect': 'Effet', 'No traits': 'Aucun trait', 'No effects': 'Aucun effet', 'Messages': 'Messages', 'General': 'Général', 'Recovery': 'Récupération', 'State': 'État', 'Buff': 'Bonus', 'Special': 'Spécial', 'Always': 'Toujours', 'Battle Only': 'Combat seulement', 'Menu Only': 'Menu seulement', 'Never': 'Jamais', 'Physical': 'Physique', 'Magical': 'Magique'
});

Object.assign(RR_TEXT_TRANSLATIONS.el, {
    'Name': 'Όνομα', 'Name:': 'Όνομα:', 'Description': 'Περιγραφή', 'Description:': 'Περιγραφή:', 'Icon': 'Εικονίδιο', 'Icon:': 'Εικονίδιο:', 'Price': 'Τιμή', 'Price:': 'Τιμή:', 'Type': 'Τύπος', 'Type:': 'Τύπος:', 'Scope': 'Εμβέλεια', 'Scope:': 'Εμβέλεια:', 'Occasion': 'Περίσταση', 'Occasion:': 'Περίσταση:', 'Speed': 'Ταχύτητα', 'Speed:': 'Ταχύτητα:', 'Success Rate': 'Ποσοστό επιτυχίας', 'Success Rate:': 'Ποσοστό επιτυχίας:', 'Repeats': 'Επαναλήψεις', 'Repeats:': 'Επαναλήψεις:', 'Hit Type': 'Τύπος χτυπήματος', 'Hit Type:': 'Τύπος χτυπήματος:', 'Animation ID': 'ID animation', 'Animation ID:': 'ID animation:', 'Damage': 'Ζημιά', 'Effects': 'Εφέ', 'Traits': 'Χαρακτηριστικά', 'Note': 'Σημείωση',
    'Add': 'Προσθήκη', 'Add Operation': 'Πρόσθεση', 'Edit': 'Επεξεργασία', 'Browse': 'Αναζήτηση', 'Browse...': 'Αναζήτηση...', 'Fixed': 'Σταθερό', 'Variable': 'Μεταβλητή', 'Variables': 'Μεταβλητές', 'Constant': 'Σταθερά', 'Increase': 'Αύξηση', 'Decrease': 'Μείωση', 'Remove': 'Αφαίρεση', 'None': 'Κανένα', 'OK': 'OK', 'Cancel': 'Άκυρο', 'Clear': 'Καθαρισμός', 'Play': 'Αναπαραγωγή', 'Stop': 'Στοπ', 'New': 'Νέο', 'Cut': 'Αποκοπή', 'Copy': 'Αντιγραφή', 'Paste': 'Επικόλληση', 'Delete': 'Διαγραφή', 'Select All': 'Επιλογή όλων', 'Copy As Text': 'Αντιγραφή ως κείμενο', 'Copy As HTML': 'Αντιγραφή ως HTML', 'Toggle Skip': 'Εναλλαγή παράλειψης', 'Test': 'Δοκιμή',
    'Actor': 'Ηθοποιός', 'Actor:': 'Ηθοποιός:', 'Enemy': 'Εχθρός', 'Enemy:': 'Εχθρός:', 'Skill': 'Δεξιότητα', 'Skill:': 'Δεξιότητα:', 'Target': 'Στόχος', 'Target:': 'Στόχος:', 'Character': 'Χαρακτήρας', 'Character:': 'Χαρακτήρας:', 'Animation:': 'Animation:', 'Equipment': 'Εξοπλισμός', 'Equipment:': 'Εξοπλισμός:', 'Slot': 'Θέση', 'Slot:': 'Θέση:', 'Weapon': 'Όπλο', 'Shield': 'Ασπίδα', 'Head': 'Κεφάλι', 'Body': 'Σώμα', 'Accessory': 'Αξεσουάρ', 'Armor': 'Πανοπλία', 'Item': 'Αντικείμενο', 'Gold': 'Χρυσός',
    'Operation': 'Λειτουργία', 'Operation:': 'Λειτουργία:', 'Operand': 'Τελεστέος', 'Single': 'Μονό', 'Batch': 'Εύρος', 'Set': 'Ορισμός', 'Sub': 'Αφαίρεση', 'Mul': 'Πολλαπλασιασμός', 'Div': 'Διαίρεση', 'Mod': 'Υπόλοιπο', 'Random': 'Τυχαίο', 'Game Data': 'Δεδομένα παιχνιδιού', 'Min:': 'Ελάχ:', 'Max:': 'Μέγ:', 'Amount:': 'Ποσότητα:', 'Amount Type:': 'Τύπος ποσότητας:', 'Value:': 'Τιμή:', 'Comparison:': 'Σύγκριση:',
    'Player': 'Παίκτης', 'This Event': 'Αυτό το γεγονός', 'Entire Troop': 'Όλη η ομάδα εχθρών', 'Wait for Completion': 'Αναμονή ολοκλήρωσης', 'frames': 'καρέ', 'Frame:': 'Καρέ:', 'seconds': 'δευτερόλεπτα', 'Start': 'Έναρξη', 'Duration:': 'Διάρκεια:', 'Distance:': 'Απόσταση:', 'tiles': 'tiles', 'Direction:': 'Κατεύθυνση:', 'Down': 'Κάτω', 'Left': 'Αριστερά', 'Right': 'Δεξιά', 'Up': 'Πάνω', 'Retain': 'Διατήρηση',
    'Self Switch:': 'Τοπικός διακόπτης:', 'Set to:': 'Ορισμός σε:', 'ON': 'ON', 'OFF': 'OFF', 'State:': 'Κατάσταση:', 'Switch': 'Διακόπτης', 'Self Switch': 'Τοπικός διακόπτης', 'Condition Type:': 'Τύπος συνθήκης:', 'Equal to (==)': 'Ίσο με (==)', 'Greater or Equal (>=)': 'Μεγαλύτερο ή ίσο (>=)', 'Less or Equal (<=)': 'Μικρότερο ή ίσο (<=)', 'Greater than (>)': 'Μεγαλύτερο από (>)', 'Less than (<)': 'Μικρότερο από (<)', 'Not Equal (!=)': 'Διάφορο (!=)', 'is:': 'είναι:',
    'Face:': 'Πρόσωπο:', 'Message:': 'Μήνυμα:', 'Maximum 4 lines of text': 'Μέγιστο 4 γραμμές κειμένου', 'Window Position:': 'Θέση παραθύρου:', 'Window': 'Παράθυρο', 'Dim': 'Σκοτεινό', 'Transparent': 'Διαφανές', 'Top': 'Πάνω', 'Middle': 'Μέση', 'Bottom': 'Κάτω', 'Preview': 'Προεπισκόπηση', 'Open in Folder': 'Άνοιγμα στον φάκελο',
    'When Cancel:': 'Στην ακύρωση:', 'Default:': 'Προεπιλογή:', 'Background:': 'Φόντο:', 'Disallow': 'Απαγόρευση', 'Branch': 'Κλάδος', 'Choice 1': 'Επιλογή 1', 'Choice 2': 'Επιλογή 2', 'Choice 3': 'Επιλογή 3', 'Choice 4': 'Επιλογή 4', 'Choice 5': 'Επιλογή 5', 'Choice 6': 'Επιλογή 6', 'Fade:': 'Fade:', 'Black': 'Μαύρο', 'White': 'Λευκό',
    'Item Type': 'Τύπος αντικειμένου', 'Item Type:': 'Τύπος αντικειμένου:', 'Regular Item': 'Κανονικό αντικείμενο', 'Key Item': 'Βασικό αντικείμενο', 'Hidden Item A': 'Κρυφό αντικείμενο A', 'Hidden Item B': 'Κρυφό αντικείμενο B', 'Consumable': 'Αναλώσιμο', 'Kind:': 'Είδος:', 'Location Type:': 'Τύπος θέσης:', 'Exchange': 'Ανταλλαγή', 'Exchange positions with another event': 'Ανταλλαγή θέσεων με άλλο γεγονός', 'Map ID:': 'ID χάρτη:', 'Event ID:': 'ID γεγονότος:', 'X Variable:': 'Μεταβλητή X:', 'Y Variable:': 'Μεταβλητή Y:', 'Designation:': 'Ορισμός:', 'Direct': 'Άμεσο',
    'Vehicle:': 'Όχημα:', 'Boat': 'Βάρκα', 'Ship': 'Πλοίο', 'Airship': 'Αερόπλοιο', 'Info Type:': 'Τύπος πληροφορίας:', 'Terrain Tag': 'Ετικέτα εδάφους', 'Region ID': 'ID περιοχής', 'Origin:': 'Αρχή:', 'Position:': 'Θέση:', 'Blend Mode:': 'Λειτουργία μίξης:', 'Upper Left': 'Πάνω αριστερά', 'Center': 'Κέντρο', 'Direct Designation': 'Άμεσος ορισμός', 'Designation with Variables': 'Ορισμός με μεταβλητές', 'Normal': 'Κανονικό', 'Additive': 'Προσθετικό', 'Multiply': 'Πολλαπλασιασμός', 'Screen': 'Οθόνη', 'Picture #:': 'Εικόνα #:', 'Enter picture filename': 'Εισάγετε όνομα αρχείου εικόνας',
    'Weather Type:': 'Τύπος καιρού:', 'Power:': 'Ισχύς:', 'Rain': 'Βροχή', 'Storm': 'Καταιγίδα', 'Snow': 'Χιόνι', 'Fadeout': 'Σβήσιμο', 'Fadein': 'Εμφάνιση', 'Script': 'Σενάριο', 'Allow Death': 'Να επιτρέπεται ο θάνατος', 'Show Level Up': 'Εμφάνιση ανόδου επιπέδου', 'Add to Party': 'Προσθήκη στην ομάδα', 'Remove from Party': 'Αφαίρεση από την ομάδα', 'Max HP': 'Μέγ. HP', 'Max MP': 'Μέγ. MP', 'Attack': 'Επίθεση', 'Defense': 'Άμυνα', 'M.Attack': 'Μ. Επίθεση', 'M.Defense': 'Μ. Άμυνα', 'Agility': 'Ευκινησία', 'Luck': 'Τύχη',
    'Movement Commands': 'Εντολές κίνησης', 'Repeat Movements': 'Επανάληψη κινήσεων', 'Skip If Cannot Move': 'Παράλειψη αν δεν μπορεί να κινηθεί', 'X Offset:': 'Μετατόπιση X:', 'Y Offset:': 'Μετατόπιση Y:', 'Frames:': 'Καρέ:', 'Frequency:': 'Συχνότητα:', 'Opacity:': 'Αδιαφάνεια:', 'File:': 'Αρχείο:', 'Volume:': 'Ένταση:', 'Pitch:': 'Τόνος:', 'Pan:': 'Πανόραμα:', 'Images': 'Εικόνες', 'General Settings': 'Γενικές ρυθμίσεις', 'Parameters': 'Παράμετροι', 'Parameter': 'Παράμετρος', 'Content': 'Περιεχόμενο', 'Effect': 'Εφέ', 'No traits': 'Χωρίς χαρακτηριστικά', 'No effects': 'Χωρίς εφέ', 'Messages': 'Μηνύματα', 'General': 'Γενικά', 'Recovery': 'Ανάκτηση', 'State': 'Κατάσταση', 'Buff': 'Ενίσχυση', 'Special': 'Ειδικό', 'Always': 'Πάντα', 'Battle Only': 'Μόνο μάχη', 'Menu Only': 'Μόνο μενού', 'Never': 'Ποτέ', 'Physical': 'Φυσικό', 'Magical': 'Μαγικό'
});

// Required high-visibility terms should never fall back to English loanwords.
Object.assign(RR_I18N_STRINGS.es, { 'menu.plugins': 'Complementos' });
Object.assign(RR_I18N_STRINGS.pt, { 'menu.plugins': 'Extensões', 'menu.managePlugins': 'Gerenciar Extensões' });
Object.assign(RR_I18N_STRINGS.de, { 'menu.plugins': 'Erweiterungen', 'menu.build': 'Erstellen' });
Object.assign(RR_I18N_STRINGS.fr, { 'menu.plugins': 'Extensions', 'menu.build': 'Compilation' });
Object.assign(RR_I18N_STRINGS.el, { 'menu.plugins': 'Πρόσθετα', 'menu.build': 'Δημιουργία' });
Object.assign(RR_EVENT_COMMAND_NAMES.es, { 'Script': 'Código' });
Object.assign(RR_EVENT_COMMAND_NAMES.pt, { 'Script': 'Código' });
Object.assign(RR_EVENT_COMMAND_NAMES.fr, { 'Script': 'Commande script' });
Object.assign(RR_EVENT_COMMAND_NAMES.el, { 'Script': 'Σενάριο' });
Object.assign(RR_TEXT_TRANSLATIONS.es, { 'Script': 'Código' });
Object.assign(RR_TEXT_TRANSLATIONS.pt, { 'Script': 'Código' });

class I18nManager {
    constructor() {
        this.SETTINGS_KEY = 'rr-settings';
        this.language = this._readSavedLanguage();
        this._observer = null;
        this._observerPending = false;
    }

    languages() {
        return RR_LANGUAGES.slice();
    }

    currentLanguage() {
        return this.language;
    }

    t(key, params = {}) {
        const table = RR_I18N_STRINGS[this.language] || RR_I18N_STRINGS.en;
        const fallback = RR_I18N_STRINGS.en[key] || key;
        let value = table[key] || fallback;
        for (const [paramKey, paramValue] of Object.entries(params)) {
            value = value.replace(new RegExp(`\\{${paramKey}\\}`, 'g'), String(paramValue));
        }
        return value;
    }

    tDbType(type, fallback = type) {
        return this.t(RR_DB_TYPE_KEYS[type] || fallback);
    }

    tEventCommandName(name) {
        if (this.language === 'en') return name;
        return RR_EVENT_COMMAND_NAMES[this.language]?.[name] || this.tText(name);
    }

    tEventSectionName(name) {
        if (this.language === 'en') return name;
        return RR_EVENT_SECTION_NAMES[this.language]?.[name] || this.tText(name);
    }

    tText(text) {
        if (this.language === 'en') return text;
        return RR_TEXT_TRANSLATIONS[this.language]?.[text]
            || RR_EVENT_COMMAND_NAMES[this.language]?.[text]
            || RR_EVENT_SECTION_NAMES[this.language]?.[text]
            || text;
    }

    setLanguage(language, options = {}) {
        const next = RR_I18N_STRINGS[language] ? language : 'en';
        if (next === this.language && options.force !== true) return;
        this.language = next;
        if (options.persist !== false) this._writeSavedLanguage(next);
        this.apply(document);
        window.dispatchEvent(new CustomEvent('rr-language-changed', { detail: { language: next } }));
    }

    apply(root = document) {
        if (!root || !root.querySelectorAll) return;
        document.documentElement.lang = this.language;

        root.querySelectorAll('[data-i18n]').forEach(el => {
            el.textContent = this.t(el.getAttribute('data-i18n'));
        });
        root.querySelectorAll('[data-i18n-title]').forEach(el => {
            el.setAttribute('title', this.t(el.getAttribute('data-i18n-title')));
        });
        root.querySelectorAll('[data-i18n-aria]').forEach(el => {
            el.setAttribute('aria-label', this.t(el.getAttribute('data-i18n-aria')));
        });
        root.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
            el.setAttribute('placeholder', this.t(el.getAttribute('data-i18n-placeholder')));
        });
        root.querySelectorAll('[data-i18n-value]').forEach(el => {
            el.value = this.t(el.getAttribute('data-i18n-value'));
        });
        this.applyText(root);
    }

    applyText(root = document) {
        if (!root || !root.querySelectorAll) return;
        const selectors = [
            'button', 'h1', 'h2', 'h3', 'h4', 'th', 'summary',
            '.database-section-header', '.database-field-label', '.rr-form-label', 'label',
            '.effect-option > span:first-of-type', '.trait-option > span:first-of-type', '.traits-table td[colspan]',
            '.modal-overlay span', '.modal-overlay div'
        ].join(',');

        root.querySelectorAll(selectors).forEach(el => {
            if (el.hasAttribute('data-rr-i18n-skip') || el.closest('[data-rr-i18n-skip]')) return;
            if (el.hasAttribute('data-i18n') || el.querySelector('input, select, textarea, button')) return;
            const source = el.getAttribute('data-i18n-text-source') || el.textContent.trim();
            if (!source) return;
            const translated = this.tText(source);
            if (translated === source && this.language !== 'en') return;
            el.setAttribute('data-i18n-text-source', source);
            el.textContent = this.language === 'en' ? source : translated;
        });

        root.querySelectorAll('[placeholder]').forEach(el => {
            const source = el.getAttribute('data-i18n-placeholder-source') || el.getAttribute('placeholder');
            if (!source) return;
            const translated = this.tText(source);
            if (translated === source && this.language !== 'en') return;
            el.setAttribute('data-i18n-placeholder-source', source);
            el.setAttribute('placeholder', this.language === 'en' ? source : translated);
        });
    }

    observe() {
        if (this._observer || typeof MutationObserver === 'undefined' || !document.body) return;
        this._observer = new MutationObserver((mutations) => {
            if (!mutations.some(m => m.addedNodes && m.addedNodes.length)) return;
            if (this._observerPending) return;
            this._observerPending = true;
            setTimeout(() => {
                this._observerPending = false;
                this.applyText(document);
            }, 0);
        });
        this._observer.observe(document.body, { childList: true, subtree: true });
    }

    _readSavedLanguage() {
        try {
            const raw = localStorage.getItem(this.SETTINGS_KEY);
            if (!raw) return 'en';
            const parsed = JSON.parse(raw);
            return RR_I18N_STRINGS[parsed.language] ? parsed.language : 'en';
        } catch (e) {
            return 'en';
        }
    }

    _writeSavedLanguage(language) {
        try {
            const raw = localStorage.getItem(this.SETTINGS_KEY);
            const parsed = raw ? JSON.parse(raw) : {};
            parsed.language = language;
            localStorage.setItem(this.SETTINGS_KEY, JSON.stringify(parsed));
        } catch (e) { /* localStorage full or disabled - ignore */ }
    }
}

window.I18n = new I18nManager();

// Early language apply: set <html lang> before the full app initializes.
(function () {
    try {
        document.documentElement.lang = window.I18n.currentLanguage();
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                window.I18n.apply(document);
                window.I18n.observe();
            });
        } else {
            window.I18n.apply(document);
            window.I18n.observe();
        }
    } catch (e) { /* ignore */ }
})();
