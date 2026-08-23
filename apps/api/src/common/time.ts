import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';

// UTC プラグインを 1 回だけ extend する。日付・時刻の処理はここから import した dayjs を使う。
dayjs.extend(utc);

/**
 * JST の UTC オフセット(時間)。日本は夏時間が無いため固定 +9 で正確に扱える。
 * `dayjs(d).utcOffset(JST_OFFSET_HOURS)` の形で使う(timezone プラグインは不要)。
 * ただし `utcOffset` をセッターとして使うには `utc` プラグインの extend(このファイルの 5 行目)が前提。
 * 素の dayjs に対して直接呼ぶと getter 扱いとなり数値のオフセット分(分)を返すだけで、
 * 後続の `.add()` 等が「関数ではない」というエラーで落ちる。
 */
export const JST_OFFSET_HOURS = 9;

export { dayjs };
