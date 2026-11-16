import config from "../config/config.js";
import { ulid } from "ulid";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { uid } from "uid";
import _ from "lodash";
import moment from "moment";

// place functions independent of project here
export default {
  truncate: (str, max) => {
    if (str) {
      return str.length > max ? str.substr(0, max - 1) + "..." : str;
    }
    return "";
  },
  ulid: () => {
    return ulid();
  },
  // Inserts a ulid into a filename (before the extension, if any) and sanitizes it for use as
  // an S3 key segment — same transform service.site.js's generateUploadUrl already used for
  // its tmp/ staging keys, now shared so every S3 write path avoids same-name collisions
  // instead of silently overwriting a prior upload with the same original filename.
  uniqueFilename: (filename) => {
    const base = (filename && filename.trim()) || "file";
    const id = ulid();
    const withId = /\.[^./]+$/.test(base)
      ? base.replace(/\.([^.]*)$/, (ext) => `-${id}${ext}`)
      : `${base}-${id}`;
    return withId.replace(/\s+/g, "-").replace(/[^0-9a-zA-Z._-]+/g, "");
  },
  uuid: () => {
    const id = uid.stamp(16);
    return id;
  },
  generatePassword: (len = 10) => {
    const charset = "@#$&*0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ@#$&*0123456789abcdefghijklmnopqrstuvwxyz";
    let password = "";
    for (let i = 0; i < len; ++i) {
      const randomByte = crypto.randomBytes(1);
      const index = randomByte[0] % charset.length;
      password += charset[index];
    }
    return password;
  },
  generateToken: (len = 32) => {
    const t = crypto.randomBytes(len).toString("hex");
    return t;
  },
  generateOtp: (len = 6) => {
    const dec = Math.pow(10, len - 1);
    const buffer = crypto.randomBytes(4);
    const otp = ((buffer.readUInt32BE(0) % (9 * dec)) + dec).toString().substring(0, len);
    return otp;
  },
  timestamp: (sec = 0) => {
    const t = Math.floor(Date.now() / 1000) + sec;
    // console.log("[timestamp]: ", t);
    return t;
  },
  round: (value, decimals) => {
    decimals = typeof decimals !== "undefined" ? decimals : 15;
    return Number(Math.round(value + "e" + decimals) + "e-" + decimals);
  },
  isset: (obj) => {
    return typeof obj !== "undefined";
  },
  isEmpty: (obj) => {
    return Object.keys(obj).length === 0;
  },
  renameKey: (obj, oldName, newName) => {
    const { [oldName]: value, ...remainingObj } = obj;
    return {
      ...remainingObj,
      [newName]: value,
    };
  },
  mergeObjects: (obj1, obj2) => ({ ...obj1, ...obj2 }),
  insertStringAt: (str, index, insertStr) => {
    return str.slice(0, index) + insertStr + str.slice(index);
  },
  hashString: (str) => {
    const h = bcrypt.hashSync(str);
    const r = Buffer.from(h).toString("base64");
    return r;
  },
  hashPassword: (pw) => {
    if (pw) {
      const h = bcrypt.hashSync(pw);
      console.log("[hashPassword] hash generated",pw,h);
      return h;
    }
    return "##_EMPTY_PASSWORD_HASH_##";
  },
  comparePassword: (pw, hash) => {
    if (pw && hash) {
      return bcrypt.compareSync(pw, hash);
    }
    return false;
  },
  stripUnknown(object) {
    if (Array.isArray(object)) {
      return object.filter((item) => item !== null && item !== undefined).map(this.stripUnknown.bind(this));
    } else if (typeof object === "object" && object !== null) {
      return Object.entries(object).reduce((acc, [key, value]) => {
        if (value !== null && value !== undefined) {
          acc[key] = this.stripUnknown(value);
        }
        return acc;
      }, {});
    }
    return object;
  },
  checkExpired: (t) => (t?.expiresAt > Math.round(Date.now() / 1000) ? t : null),
  timeConverter: (unixTimestamp) => {
    const a = new Date(unixTimestamp * 1000);
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const year = a.getFullYear();
    const month = months[a.getMonth()];
    const date = a.getDate();
    const time = date + " " + month + " " + year;
    return time;
  },
  flattenNestedObjects: (obj) =>
    Object.entries(obj).reduce((acc, [key, value]) => {
      if (typeof value === "object" && !Array.isArray(value)) {
        return { ...acc, ...value };
      }
      return { ...acc, [key]: value };
    }, {}),
  flattenFormData: (obj, parentPrefix = "") => {
    let output = {};
    for (let key in obj) {
      if (!obj.hasOwnProperty(key)) continue;
      let newKey = parentPrefix ? `${parentPrefix}[${key}]` : key;
      if (typeof obj[key] === "object" && obj[key] !== null && !(obj[key] instanceof File)) {
        Object.assign(output, flatten(obj[key], newKey));
      } else {
        output[newKey] = obj[key];
      }
    }
    return output;
  },
  decodeEntities(encodedString) {
    const translateRegex = /&(nbsp|amp|quot|lt|gt);/g;
    const translate = {
      nbsp: " ",
      amp: "&",
      quot: '"',
      lt: "<",
      gt: ">",
    };
    return encodedString.replace(translateRegex, (_, entity) => translate[entity]).replace(/&#(\d+);/gi, (_, numStr) => String.fromCodePoint(parseInt(numStr, 10)));
  },
  convertObjToReadableStr: (obj) => {
    obj = cleanObject(_.cloneDeep(obj));
    let result = "";

    function formatKey(key) {
      return key
        .replace(/([a-z])([A-Z])/g, "$1 $2")
        .replace(/_/g, " ")
        .replace(/\b\w/g, (char) => char.toUpperCase());
    }

    function processArray(key, array, indentLevel) {
      const sectionTitle = `${formatKey(key)} Information:`;
      result += " ".repeat(indentLevel) + sectionTitle + "\n";
      result += " ".repeat(indentLevel) + "--------------------------------------\n";
      array.forEach((item) => {
        for (let innerKey in item) {
          processKeyValue(innerKey, item[innerKey], indentLevel + 2, key);
        }
        result += "\n";
      });
    }

    function processKeyValue(key, value, indentLevel = 0, parentKey = "") {
      const formattedKey = formatKey(key);
      const indent = " ".repeat(indentLevel);
      if (typeof value === "object" && value !== null) {
        if (Array.isArray(value)) {
          if (key == "proofOfIdentity") {
            result += " ".repeat(indentLevel) + formatKey(key) + ":\n";
            value.forEach((item) => {
              if (item.name) {
                result += `${indent}- FileName: ${item.name}\n`;
              }
            });
          } else {
            processArray(key, value, indentLevel);
          }
        } else if (value instanceof Date) {
          result += `${indent}${formattedKey}: "${formatDate(value)}"\n`;
        } else {
          result += `${indent}${formattedKey}:\n`;
          for (let innerKey in value) {
            processKeyValue(innerKey, value[innerKey], indentLevel + 2, key);
          }
        }
      } else {
        result += `${indent}${formattedKey}: ${value}\n`;
      }
    }

    function cleanObject(obj) {
      if (typeof obj !== "object" || obj === null) return obj;

      for (let key in obj) {
        if (obj[key] && typeof obj[key] === "object") {
          if (obj[key] instanceof Date) {
            obj.effectiveDate = obj[key];
            delete obj[key];
            continue;
          }
          obj[key] = cleanObject(obj[key]);
          if (Object.keys(obj[key]).length === 0) {
            delete obj[key];
          }
        } else if (obj[key] === null || obj[key] === false || obj[key] === "" || obj[key] === undefined) {
          delete obj[key];
        }
      }
      return obj;
    }

    for (let key in obj) {
      processKeyValue(key, obj[key]);
    }

    return result.trim();
  },
  formatDateTime: (date) => {
    const options = {
      timeZone: "Asia/Singapore",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    };
    const formatter = new Intl.DateTimeFormat("en-GB", options);
    const parts = formatter.formatToParts(new Date(date));
    const formattedDate = `${parts[0].value}/${parts[2].value}/${parts[4].value} | ${parts[6].value}:${parts[8].value}:${parts[10].value} ${parts[12].value}`;
    return formattedDate;
  },
  // "Tuesday, 2026-08-25" (Asia/Singapore) for a given date/ISO-string/epoch — used for "Today
  // is ..." prompt context, where only the calendar day matters, not a specific time.
  formatDateContext: (date = new Date()) => {
    const d = date instanceof Date ? date : new Date(date);
    const dateFormatter = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Singapore", year: "numeric", month: "2-digit", day: "2-digit" });
    const weekdayFormatter = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Singapore", weekday: "long" });
    return `${weekdayFormatter.format(d)}, ${dateFormatter.format(d)}`;
  },
  // "Wed, 2026-08-25, 12:43pm" (Asia/Singapore) — per-message tag in conversation
  // history/transcripts, so an LLM resolving a relative date/time phrase ("this Friday",
  // "an hour ago") anchors it to exactly when that message was sent, not just the day.
  formatMessageDateTag: (date) => {
    const d = date instanceof Date ? date : new Date(date);
    const dateFormatter = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Singapore", year: "numeric", month: "2-digit", day: "2-digit" });
    const weekdayFormatter = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Singapore", weekday: "short" });
    const timeFormatter = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Singapore", hour: "numeric", minute: "2-digit", hour12: true });
    const time = timeFormatter.format(d).replace(/\s?([AP]M)$/i, (_, ampm) => ampm.toLowerCase());
    return `${weekdayFormatter.format(d)}, ${dateFormatter.format(d)}, ${time}`;
  },
  splitTextIntoChunks: (text, maxLength) => {
    const chunks = [];
    for (let i = 0; i < text.length; i += maxLength) {
      chunks.push(text.slice(i, i + maxLength));
    }
    return chunks;
  },
  // Builds a sales quote's externalDocumentNumber, e.g. "EM-260919-1722-PO-FOR-SEPT-t5fs" —
  // prefix identifies the source (WA/EM), label is a human-readable hint (email subject,
  // WhatsApp group name/contact name) so staff reading Business Central directly can tell
  // quotes apart without opening each one. Business Central's External Document No. field caps
  // at 35 chars, so label is sanitized (non-alphanumeric runs collapsed to a single hyphen) and
  // truncated to whatever's left after prefix/date/time/random/hyphens — sized off the actual
  // prefix length rather than a fixed guess, so a longer prefix can't push the total over.
  generateExternalDocNo: (prefix, label) => {
    const FIELD_MAX_LEN = 35;

    const now = new Date();
    const year    = String(now.getFullYear()).slice(-2);
    const month   = String(now.getMonth() + 1).padStart(2, '0');
    const day     = String(now.getDate()).padStart(2, '0');
    const hours   = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const datePart = `${year}${month}${day}`;
    const timePart = `${hours}${minutes}`;
    const randomStr = Math.random().toString(36).substring(2, 6);

    // 4 hyphens joining the 5 segments below.
    const maxLabelLen = Math.max(0, FIELD_MAX_LEN - (prefix.length + datePart.length + timePart.length + randomStr.length + 4));
    const sanitizedLabel = (label ?? "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .slice(0, maxLabelLen)
      .replace(/^-+|-+$/g, "");

    return [prefix, datePart, timePart, sanitizedLabel, randomStr]
      .filter(Boolean)
      .join("-");
  },
  underlineWhatsappText: (text) => {
    return text.split('').join('\u0332') + '\u0332';
  }

};
