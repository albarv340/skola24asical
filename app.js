const ical = require("ical-generator");
const http = require("http");
const request = require("request");
const moment = require("moment-timezone");
const util = require("util");
const express = require("express");
const async = require("async");

function main() {
  var app = express();

  app.get("/", (req, res) => {
    res.send(
      'Använd denna sida för att kunna prenumerera på ett schema av skola24.se i ical format. See projektet på github: <a href="https://github.com/Gronis/skola24asical">https://github.com/Gronis/skola24asical</a>'
    );
  });

  app.get("/schedule/:domain/:schoolGuid/:groupGuid", (req, res) => {
    const domain = req.params.domain;
    const school = req.params.schoolGuid;
    const group = req.params.groupGuid;
    weeks = [0]
      .map(x => (x + moment().isoWeek()) % 52)
      .map(x => (x == 0 ? 52 : x));
    console.log("Fetching schedule for ", domain, school, group);
    console.log("During weeks: ", weeks);
    counter = weeks.length;
    all_events = [];

    weeks.map(week =>
      get_events(domain, school, group, week, events => {
        all_events = all_events.concat(events);
        counter--;
        if (counter == 0) {
          // console.log("Sending", all_events)
          res.send(transform_to_ics_events(all_events));
        }
      })
    );
  });

  app.listen(8080, () => console.log("Started!"));

  // const school = {
  //     "Guid": "c7a07cfd-25b1-439d-a37c-10638e2be616"
  // }
  // const group = {
  //     "Guid": "a9ff834a-dcdf-4e39-afdb-583f7e6c58d1"
  // }

  // const domain = "goteborg.skola24.se"

  // get_events(domain, school, group, (events) => {
  //     ical_text = transform_to_ics_events(events)
  // })
}

function get_events(domain, school, group, week, callback) {
  const re_weekday = /(Måndag\s\d*\/\d*)|(Tisdag\s\d*\/\d*)|(Onsdag\s\d*\/\d*)|(Torsdag\s\d*\/\d*)|(Fredag\s\d*\/\d*)/i;
  const re_time = /^\d*:\d*/i;
  const re_text = /\X*/i;
  const re_room = /[A-Z]\d{3}/;
  const star = /\*/g;
  const multi_space = / +/g;
  const body = {
    request: {
      divWidth: 500,
      divHeight: 500,
      headerEnabled: false,
      selectedPeriod: null,
      selectedWeek: 3,
      selectedTeacher: null,
      selectedGroup: null,
      selectedClass: null,
      selectedRoom: null,
      selectedStudent: null,
      selectedCourse: null,
      selectedSubject: null,
      selectedUnit: {
        name: "Berzeliusskolan gymnasium",
        schoolGuid: null,
        unitGuid: "ODUzZGRmNmMtYzdiNy1mZTA3LThlMTctNzIyNDY2Mjk1Y2I2",
        isTopUnit: false,
        settings: {
          activateViewer: true,
          allowCalendarExport: true
        }
      },
      selectedSignatures: {
        signature: "te17e"
      },
      selectedDay: 0,
      domain: "linkoping.skola24.se"
    }
  };

  const options = {
    url: "https://web.skola24.se/timetable/timetable-viewer/data/render",
    headers: {
      Accept: "application/json, text/javascript, */*; q=0.01",
      "Content-Type": "application/json",
      "X-Scope": "8a22163c-8662-4535-9050-bc5e1923df48"
    },
    body: JSON.stringify(body)
  };

  return request.post(options, function(error, response, body) {
    const vertical_match = (rect, list) =>
      list.filter(item => item.x > rect.x1 && item.x < rect.x2);
    const horizontal_match = (rect, list) =>
      list.filter(item => item.y > rect.y1 && item.y < rect.y2);
    const inside = (rect, list) =>
      vertical_match(rect, horizontal_match(rect, list));

    const text = list =>
      list
        .map(item => item.text)
        .join(" ")
        .replace(multi_space, " ")
        .replace(star, "");

    res = JSON.parse(body);
    // console.log(res.data.boxList);
    weekdays = res.data.textList.filter(e => e.text.match(re_weekday));
    // console.log(weekdays);
    times = res.data.textList.filter(e => e.text.match(re_time));
    console.log(times);
    texts = res.data.textList.filter(
      e =>
        e.text.match(re_text) &&
        !e.text.match(re_weekday) &&
        !e.text.match(re_time) &&
        e.text.length > 0
    );
    // console.log(texts);

    titles = texts.filter(e => !e.text.match(re_room));
    // console.log(titles);
    rooms = texts.filter(e => e.text.match(re_room));
    // console.log(rooms);

    // console.log(times.length);
    times.splice(0, 38);
    // console.log(times);
    times_start = times.filter(
      (e, i) => (e.x - 21) % 27 == 0 || ((e.x - 7) % 81 == 0 && e.x != 7)
    );
    // console.log(times_start);
    // for (let i = 0; i < times.length; i++) {
    //   let firstTime = times[i].text.split(":");
    //   firstTime = firstTime[0] + firstTime[1];
    //   if (i < times.length - 1) {
    //     let lastTime = times[i + 1].text.split(":");
    //     lastTime = lastTime[0] + lastTime[1];
    //     console.log(firstTime, lastTime, i);
    //     if (lastTime < firstTime && i % 2 == 0) {
    //       times.splice(i, 0, times[i + 1]);
    //     }
    //   }
    // }
    times_end = times.filter((e, i) => (e.x - 27) % 27 == 0);
    // console.log(times_end);

    // If start and end-times are more than start-times, something is fishy
    // Known reasons:
    //      - collisions in schedule
    //
    // Just skip those weeks, for now
    // if (times_start.length > times_end.length) {
    //   return callback([]);
    // }

    events = times_start
      .map((e, i) => {
        o = {
          x1: e.x,
          y1: e.y,
          x2: times_end[i].x,
          y2: times_end[i].y,
          start: e.text,
          end: times_end[i].text,
          width: times_end[i].x - e.x,
          height: times_end[i].y - e.y
        };
        return o;
      })
      .filter(event => event.width != 1)
      .map(event => {
        // console.log(event);
        event.title = text(inside(event, titles));
        // console.log(event.title);
        // console.log(event);
        event.room = text(inside(event, rooms));
        event.day = text(vertical_match(event, weekdays));
        // console.log(event, "hej", weekdays);
        return event;
      });

    callback(events);
  });
}

function transform_to_ics_events(events) {
  //   console.log(events);
  const re_date = /\d*\/\d*/i;
  const year = new Date().getFullYear();
  const fix_timezone = date =>
    moment
      .tz(date, "Europe/Stockholm")
      .clone()
      .tz("Europe/London")
      .toDate();

  ics_events = events.map(e => {
    const date = new String(e.day.match(re_date))
      .split("/")
      .reverse()
      .map(x => parseInt(x));
    const start = e.start.split(":").map(x => parseInt(x));
    const end = e.end.split(":").map(x => parseInt(x));
    const start_date = fix_timezone([
      year,
      date[0] - 1,
      date[1],
      start[0],
      start[1]
    ]);
    const end_date = fix_timezone([year, date[0] - 1, date[1], end[0], end[1]]);
    // console.log(e);
    event = {
      summary: e.title,
      location: e.room,
      start: start_date,
      end: end_date
    };
    return event;
  });
  cal = ical({
    domain: "localhost",
    timezone: "Europe/Stockholm"
  });
  cal.events(ics_events);
  return cal.toString();
}

main();
