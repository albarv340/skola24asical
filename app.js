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

  app.get("/subscribe/:signature/", (req, res) => {
    let signature = req.params.signature;
    let week = moment(new Date()).isoWeek();
    console.log("Fetching schedule for " + signature);
    console.log("During week: " + week);
    all_events = [];

    get_events(signature, week, events => {
      all_events = all_events.concat(events);
      res.send(transform_to_ics_events(all_events));
    });
  });

  app.get("/schedule/:signature/:week", (req, res) => {
    let signature = req.params.signature;
    let week = req.params.week;
    console.log("Fetching schedule for " + signature);
    console.log("During week: " + week);
    all_events = [];
    get_events(signature, week, events => {
      all_events = all_events.concat(events);
      res.send(transform_to_ics_events(all_events));
    });
  });

  app.listen(2400, () => console.log("Started!"));

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

function get_events(signature, week, callback) {
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
      selectedWeek: week,
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
        signature: signature
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
      list.filter(item => item.x + 10 > rect.x1 && item.x - 10 < rect.x2);
    const horizontal_match = (rect, list) =>
      list.filter(item => item.y + 10 > rect.y1 && item.y - 10 < rect.y2);
    const inside = (rect, list) =>
      vertical_match(rect, horizontal_match(rect, list));

    const text = list =>
      list
        .map(item => item.text)
        .join(" ")
        .replace(multi_space, " ")
        .replace(star, "");

    res = JSON.parse(body);
    // console.log(res.data);
    if (res.data === null) {
      return;
    }
    weekdays = res.data.textList.filter(e => e.text.match(re_weekday));
    // console.log(weekdays);
    times = res.data.textList.filter(e => e.text.match(re_time));
    // console.log(times);
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
      (e, i) => (e.x - 21) % 27 == 0 || (e.x - 7) % 81 == 0
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
    let times_start_end = [];
    times_start.forEach((start, starti) => {
      let distances = [];
      times_end.forEach((end, endi) => {
        if (end.x > start.x && end.y > start.y) {
          distances.push({
            distance: Math.sqrt(
              Math.pow(end.x - start.x, 2) + Math.pow(end.y - start.y, 2)
            ),
            start_index: starti,
            end_index: endi
          });
        }
      });
      distances.sort(function(a, b) {
        return a.distance - b.distance;
      });
      times_start_end.push(times_start[distances[0].start_index]);
      times_start_end.push(times_end[distances[0].end_index]);
      // console.log(distances);
    });
    // console.log(times_start_end);

    times_start = times_start_end.filter((e, i) => i % 2 == 0);
    times_end = times_start_end.filter((e, i) => i % 2 == 1);

    // console.log(times_start, times_end);
    // If start and end-times are more than start-times, something is fishy
    // Known reasons:
    //      - collisions in schedule
    //
    // Just skip those weeks, for now
    // if (times_start.length > times_end.length) {
    //   return callback([]);
    // }
    const weekdayCheck = (rect, list) => {
      // console.log(rect);
      // console.log(list);
      if (rect.x1 < 110) {
        list = list.filter(item => item.x >= 50 && item.x <= 55);
      } else if (rect.x1 >= 110 && rect.x1 < 193) {
        list = list.filter(item => item.x >= 130 && item.x <= 135);
      } else if (rect.x1 >= 193 && rect.x1 < 275) {
        list = list.filter(item => item.x >= 210 && item.x <= 215);
      } else if (rect.x1 >= 275 && rect.x1 < 357) {
        list = list.filter(item => item.x >= 292 && item.x <= 297);
      } else if (rect.x1 >= 357) {
        list = list.filter(item => item.x >= 375 && item.x <= 380);
      }
      return list;
    };
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
        event.day = text(weekdayCheck(event, weekdays));
        // console.log(event, weekdays);
        // console.log(event.day);
        return event;
      });

    callback(events);
  });
}

function transform_to_ics_events(events) {
  // console.log(events);
  const re_date = /\d*\/\d*/i;
  const year = new Date().getFullYear();
  const fix_timezone = date => moment.tz(date, "Europe/Stockholm").toDate();

  ics_events = events.map(e => {
    const date = new String(e.day.match(re_date))
      .split("/")
      .reverse()
      .map(x => parseInt(x));
    // console.log(date);
    const start = e.start.split(":").map(x => parseInt(x));
    // console.log(start);
    const end = e.end.split(":").map(x => parseInt(x));
    // console.log(end);
    const start_date = fix_timezone([
      year,
      date[0] - 1,
      date[1],
      start[0],
      start[1]
    ]);
    // console.log(start_date);
    const end_date = fix_timezone([year, date[0] - 1, date[1], end[0], end[1]]);
    // console.log(end_date);
    // console.log(e);
    event = {
      summary: e.title,
      location: e.room,
      start: start_date,
      end: end_date
    };
    // console.log(event);
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
