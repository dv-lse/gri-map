TODO
====

  - [x] Stroke edge of tiny country circles
  - [x] Move circles out of GIS

  - [ ] Collect slivers of emissions bar into 'Others' category
  - [ ] Corollary:  Visual problems with smallest lines in emissions bar

  - [ ] iframe not opening for initial dropdown selection
  - [x] Move iframe code back to index.js (bc url is in data file)

  - [x] Click on EU - zoom to what?
  - [ ] Click on tiny countries - zoom to what?
        * Stop zooming at standard scale extent
  - [ ] Legend must move to allow for detail box?

  - [x] Use admin0 countries GIS set instead of subunits?

  - [x] EU hover is clunky: use partition object in GIS data model too?  or CSS selectors?

  - [x] Use NE tiny countries + EU for choropleth dots
  - [x] Legend (fixed location)
  - [x] Small countries / islands in GIS layer
  - [x] Use land layer for continents; omit any features that are not countries

  - [x] Continue using stratify + partition, or roll own solution?
  - [x] Mouseover on map
  - [ ] +/-/reset buttons for zoom
  - [x] Bounded panning
  - [x] Close mark on detail box

  - [x] Marks every 10%, no decimal in emissions
  - [x] Map transition shouldn't be green
  - [ ] Two background areas
          fixed, behind emissions bar
          temporary, behind all labels

  - [ ] Unfocus on a country on any drag or zoom
  - [x] EU in dropdown, group in emissions bar

  - [ ] Remove globe circle & adjust background  NOT TO DO
  - [x] Basic zoom & drag
  - [x] Limit zoom extent
  - [x] Dropdown to select country
  - [ ] Search to limit dropdown  NOT TO DO
  - [ ] Radio buttons for metric  NOT TO DO
  - [x] Click country to focus
  - [x] Zoom to focused country
  - [x] Info box on focused country
  - [ ] Zoom-to-area bounding box needs tweaking
  - [ ] Focus color remaining when zooming out  NOT TO DO

  - [ ] Move focus calculations to prepublish step  HALF DONE

  - [ ] Live search match to countries  NOT TO DO


COUNTRIES REQUIRING HAND-TWEAKS
===============================

  - [ ] ECU Ecuador
  - [ ] ESP Spain
  - [ ] EUR European Union (bc of French Guyana... remove it?)
  - [ ] FJI   Fiji
  - [ ] FRA France (")
  - [ ] IOA ???
  - [ ] KIR ???
  - [ ] NLD Netherlands
  - [ ] NZL New Zealand
  - [ ] NOR Norway
  - [ ] PRT Portugal
  - [ ] RUS Russia
  - [ ] ZAF South Africa
  - [ ] USA United States of America

LATER
=====

  - [ ] Responsive layout


OPEN ISSUES
===========

  - [ ] Choropleth fill/information disappears on focus
  - [ ] URL in focused state?


PROBLEMATIC FEATURES: SMALL
==========================

  - The following are in the NE tiny country points annex, EXCEPT:
    JAM, BEL, JOR, KWT, RWA, UAE
  - in tiny countries, the sov_a3 attribute is sovereign country ISO

  - [ ] Island, no features: MDV, FSM, SGP
  - [ ] Island, in NE small countries only: TUV
  - [ ] Island: GRD, JAM, TTO, VUT
  - [ ] Land: BEL, ISR, JOR, KWT, NLD, RWA, UAE

PROBLEMATIC FEATURES: OTHER
===========================

  - [ ] European union (EUR)
