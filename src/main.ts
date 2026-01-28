import { DOMParser, Element } from "@b-fuze/deno-dom";
import { throw_ } from "~/utilities/throw.ts";

const DAY_ROLLOVER = Temporal.PlainTime.from({ hour: 6, minute: 0, second: 0 });
const BASE_URL = "https://fishingonorfu.hu";
const DAYS = [
  {
    date: Temporal.PlainDate.from("2026-06-24"),
    url: `${BASE_URL}/fellepok/napi-bontas/szerda`,
  },
  {
    date: Temporal.PlainDate.from("2026-06-25"),
    url: `${BASE_URL}/fellepok/napi-bontas/csutortok`,
  },
  {
    date: Temporal.PlainDate.from("2026-06-26"),
    url: `${BASE_URL}/fellepok/napi-bontas/pentek`,
  },
  {
    date: Temporal.PlainDate.from("2026-06-27"),
    url: `${BASE_URL}/fellepok/napi-bontas/szombat`,
  },
] as const;

interface Act {
  stage: string;
  start: string;
  end: string;
  act: string;
  blurb?: string;
  url?: string;
}

const acts = await fetchActs();

for (const act of acts) {
  console.log(`act = ${JSON.stringify(act)}`);
}

async function fetchActs(): Promise<Act[]> {
  const acts = await Promise.all(
    DAYS.map(async ({ date, url }) => await fetchActsForDate(date, url)),
  );

  return acts.flat();
}

async function fetchActsForDate(
  date: Temporal.PlainDate,
  url: string,
): Promise<Act[]> {
  const response = await fetch(url);
  const html = await response.text();

  const document = new DOMParser().parseFromString(html, "text/html");

  const stageElements = Array.from(
    document.querySelectorAll(".program-stage-section"),
  );
  const acts = await Promise.all(
    stageElements.map(async (stageElement) =>
      await fetchActsForStage(date, stageElement)
    ),
  );

  return acts.flat();
}

async function fetchActsForStage(
  date: Temporal.PlainDate,
  stageElement: Element,
): Promise<Act[]> {
  const stage = stageElement.querySelector(".program-stage-label")
    ?.textContent.trim() ?? throw_("Missing stage name");

  const actElements = Array.from(
    stageElement.querySelectorAll(".program-performer"),
  );
  const acts = await Promise.all(
    actElements.map(async (actElement): Promise<Act> => {
      const act = actElement.querySelector(".program-performer-name")
        ?.textContent.trim() ?? throw_("Missing act name");

      const [startTimeString, endTimeString] =
        actElement.querySelector(".program-duration")
          ?.textContent.trim().split(" - ") ?? throw_("Missing act duration");

      const startPlainTime = Temporal.PlainTime.from(startTimeString);
      const startsAfterMidnight =
        Temporal.PlainTime.compare(startPlainTime, DAY_ROLLOVER) < 0;
      const startDate = startsAfterMidnight ? date.add({ days: 1 }) : date;
      const start = `${String(startDate)} ${startTimeString}`;

      const endPlainTime = Temporal.PlainTime.from(endTimeString);
      const endsAfterMidnight =
        Temporal.PlainTime.compare(endPlainTime, DAY_ROLLOVER) < 0;
      const endDate = endsAfterMidnight ? date.add({ days: 1 }) : date;
      const end = `${String(endDate)} ${endTimeString}`;

      const extra = await fetchActExtraDetails(actElement);

      return ({ stage, act, start, end, ...extra });
    }),
  );

  return acts;
}

async function fetchActExtraDetails(
  actElement: Element,
): Promise<Partial<Act>> {
  const linkElement = actElement.querySelector(
    ".program-performer-link",
  );
  if (linkElement == null) return {};

  const detailsUrl = linkElement.dataset.url;
  if (detailsUrl == null) return {};

  interface ActDetails {
    performer?: {
      description?: string;
      youtube_url?: string;
    };
  }
  const detailsResponse = await fetch(detailsUrl, {
    headers: {
      Accept: "application/json",
      "X-Requested-With": "XMLHttpRequest",
    },
  });
  if (!detailsResponse.ok) return {};
  const detailsJson: ActDetails = await detailsResponse.json();

  const blurb = detailsJson.performer?.description == null
    ? undefined
    : new DOMParser().parseFromString(
      detailsJson.performer.description,
      "text/html",
    ).textContent?.trim();

  const url = detailsJson.performer?.youtube_url;

  return {
    ...(blurb != null ? { blurb } : {}),
    ...(url != null ? { url } : {}),
  };
}
