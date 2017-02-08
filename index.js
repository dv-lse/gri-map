import * as d3 from 'd3'
import * as topojson from 'topojson-client'

import * as queue from 'd3-queue'
import {geoEckert3} from 'd3-geo-projection'
import * as scheme from 'd3-scale-chromatic'

const DATAPOINT = 'data/emissions.json'
const WORLD_MAP = 'world/50m.json'

const BAR_MARGINS = { top: 0, right: 15, bottom: 65, left: 15 }
const BAR_HEIGHT = 20

function install(elem, width, height) {

  let component = d3.dispatch('change')

  // main application state

  let focus_id = null

  queue.queue()
    .defer(d3.json, WORLD_MAP)
    .defer(d3.json, DATAPOINT)
    .await( (err, world, countries) => {
      if(err) throw err

      // post-process countries dataset [ becomes emissions bar ]

      countries = countries.filter( (d) => d.is_country )
      countries.forEach( (d) => d.id = d.iso )
      countries.sort( (a,b) => d3.ascending(a.name, b.name) )

      // post-process map [ move laws count into GIS dataset ]

      let features = topojson.feature(world, world.objects.countries).features

      let laws = countries.reduce( (m, d) => (m[d.iso] = d.laws, m), {} )
      features.forEach( (d) => {
        if(d.id in laws) { d.properties.laws = laws[d.id] }
      })

      // visualisation

      let svg = d3.select(elem)
        .append('svg')
          .attr('class', 'map')
          .attr('width', width)
          .attr('height', height)

      let g = svg.append('g')

      let projection = geoEckert3()
        .scale(180)
        .translate([0, 0])
        .precision(.1)

      let path = d3.geoPath()
        .projection(projection)

      let graticule = d3.geoGraticule()

      let laws_scale = d3.scaleThreshold()
        .domain([1, 5, 10, 15, 20])
        .range(scheme.schemeBlues[7].slice(1))

      let emissions_scale = d3.scaleLinear()
        .domain([0, d3.sum(countries, (d) => d.emissions)])
        .range([0, width - BAR_MARGINS.left - BAR_MARGINS.right ])

      let offset = 0
      let emissions_indices = d3.range(0,countries.length)
                                .sort( (a,b) => d3.descending(countries[a].emissions, countries[b].emissions) )
      let emissions = emissions_indices.map( (i) => {
        let v = emissions_scale(countries[i].emissions)
        let d = [ offset, offset + v ]
        offset += v
        d.data = countries[i]
        d.id = countries[i].id
        return d
      })

      let percent_fmt = d3.format('.1%')
      let emissions_fmt = d3.format(',.1f')

      // SVG elements

      svg.on('click', () => {
        focus(null)
      })

      g.append('path')
        .attr('class', 'map-sphere')
        .datum({type: 'Sphere'})
        .attr('d', path)

      g.append('path')
        .datum(graticule)
        .attr('class', 'map-graticule')
        .attr('d', path)

      g.append('g')
          .attr('class', 'map-features')
        .selectAll('.map-feature')
          .data(features)
         .enter().append('g')
          .attr('class', (d) => 'map-feature ' + d.id + (d.properties.laws >= 0 ? ' country' : ''))
          .append('path')
            .attr('d', path)
            .attr('fill', 'lightgray')

      let left_justify = (d) => (d[0] + d[1]) / 2 < width / 2
      let emissions_bar = svg.append('g')
          .attr('class', 'emissions_bar')
          .attr('transform', 'translate(' + [ BAR_MARGINS.left, height - BAR_MARGINS.bottom - BAR_HEIGHT ] + ')')
        .selectAll('.emissions')
            .data(emissions)
          .enter().append('g')
            .attr('class', (d) => 'emissions country ' + d.data.iso)

      emissions_bar.append('path')
          .attr('d', (d) => 'M' + d[0] + ' 0H' + d[1] + 'V' + BAR_HEIGHT + 'H' + d[0] + 'Z')

      let emissions_label = emissions_bar.append('g')
        .attr('class', 'label')
        .attr('transform', (d) => 'translate(' + (left_justify(d) ? d[0] : d[1]) + ')')
        .attr('text-anchor', (d) => left_justify(d) ? 'start' : 'end')

      emissions_label.append('text')
        .attr('dy', '-3.25em')
        .text( (d) => d.data.name )

      emissions_label.append('text')
        .attr('dy', '-1.75em')
        .text( (d) => d.data.laws + ' laws')

      emissions_label.append('text')
        .attr('dy', '-.5em')
        .text( (d) => {
          let pct = d.data.emissions / emissions_scale.domain()[1]
          return emissions_fmt(d.data.emissions) + ' MTCO2e [ ' + (pct < 0.001 ? '≤ 0.1%' : percent_fmt(pct)) + ' ]'
        })

      let emissions_axis = svg.append('g')
          .attr('class', 'axis')
          .attr('transform', 'translate(' + [ BAR_MARGINS.left, height - BAR_MARGINS.bottom] + ')')

      let ticks = emissions_axis.selectAll('.tick')
        .data([0,.25,.5,.75,1])
        .enter().append('g')
          .attr('class', 'tick')
          .attr('text-anchor', 'end')
          .attr('transform', (i) => 'translate(' + (emissions_scale.range()[1] * i) + ')')

      ticks.append('line')
        .attr('x1', 0.5)
        .attr('x2', 0.5)
        .attr('y1', 2)
        .attr('y2', 8)

      ticks.append('text')
        .attr('x', 10)
        .attr('y', 10)
        .attr('dy', '0.7em')
        .text(percent_fmt)

      ticks.filter((i) => i === 1)
        .append('text')
          .attr('x', 10)
          .attr('y', 10)
          .attr('dy', '1.75em')
          .text((d) => emissions_fmt(emissions_scale.domain()[1] * d) + ' MTCO2e' )

      function update(sel, hover_id) {
        sel.selectAll('.map-feature.country path')
          .attr('fill', (d) => d.id !== hover_id ? laws_scale(d.properties.laws) : 'orange')
        sel.selectAll('.emissions path')
          .attr('fill', (d) => d.id !== hover_id ? 'orange' : 'red')
        sel.selectAll('.emissions .label')
          .attr('opacity', (d) => d.id !== hover_id ? 0 : 1)
      }

      // interaction

      d3.selectAll('.country path')
        .on('click', function(d) {
          focus(d.id !== focus_id ? d.id : null)
          d3.event.stopPropagation()
        })
        .on('mouseenter', (d) => focus_id || highlight(d.id) )
        .on('mouseleave', () => focus_id || highlight(null) )

      let zoom = d3.zoom()
        .scaleExtent([0.9, 8])
        .on('zoom', () => {
          let t = d3.event.transform
          g.attr('transform', t)
           .style('stroke-width', 1.5 / t.k + 'px')
        })

      svg.call(update, null)
         .call(zoom)
         .call(zoom.transform, zoomTransform(null))


      // HTML controls

      let dropdown = d3.select(elem)
        .append('select')
          .attr('class', 'map-select')
        .on('change', () => {
          var iso = d3.event.target.value
          focus(iso !== 'NONE' ? iso : null)
        })

      dropdown.selectAll('option')
           .data([null].concat(countries))
         .enter().append('option')
           .attr('value', (d) => d ? d.id : 'NONE')
           .html((d) => d ? d.name : 'Select country')

      function focus(id) {
        // Update application state
        //   NB does NOT fire a change event, so no loops
        focus_id = id
        dropdown.property('value', id || 'NONE')

        highlight(id)

        let t = svg.transition('zoom')
          .duration(2000)
          .call(zoom.transform, zoomTransform(id))

        component.call('change', null, id)
      }

      // utility functions

      function zoomTransform(id) {
        if(id) {
          let c = focus_coords(id)
          return d3.zoomIdentity
             .translate(c.x, c.y)
             .scale(c.scale)
        } else {
          return d3.zoomIdentity
                   .translate(width/2, height/2)
        }
      }

      function highlight(id) {
        svg.transition('highlight')
          .duration(500)
          .call(update, id)
      }

      function focus_coords(id) {
        // c.f. https://bl.ocks.org/iamkevinv/0a24e9126cd2fa6b283c6f2d774b69a2

        let sel_features = features.filter( (d) => d.id === id )
        let areas = sel_features.map(path.area)
        let idx = d3.range(0,areas.length).sort((a,b) => d3.descending(areas[a], areas[b]))[0]

        let bounds = path.bounds(sel_features[idx])
        let dx = bounds[1][0] - bounds[0][0]
        let dy = bounds[1][1] - bounds[0][1]
        let x = (bounds[0][0] + bounds[1][0]) / 2
        let y = (bounds[0][1] + bounds[1][1]) / 2
        let scale = Math.max(1, Math.min(20, 0.9 / Math.max(dx / width, dy / height)))
        let translate = [width / 4 - scale * x, height / 2 - scale * y]

        return { x: translate[0], y: translate[1], scale: scale }
      }
    })

  return component
}

export { install }
