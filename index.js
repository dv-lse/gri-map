import * as d3 from 'd3'
import * as topojson from 'topojson-client'

import * as queue from 'd3-queue'
import {geoEckert3} from 'd3-geo-projection'
import * as scheme from 'd3-scale-chromatic'

import './styles/styles.css!'
import './styles/map.css!'

const DATAPOINT = 'data/emissions.json' //'http://www.lse.ac.uk/GranthamInstitute/wp-json/countries/v1/data/55783476/'
const WORLD_MAP = 'world/map.json'
const FOCUS_BOUNDS = 'data/focus_bounds.csv'

const BAR_MARGINS = { top: 0, right: 105, bottom: 65, left: 15 }
const BAR_HEIGHT = 20

const LEGEND_MARGINS = { top: 50, right: 50, bottom: 20, left: 20 }
const LEGEND_WIDTH = 10

const BACKGROUND_MARGINS = { top: 5, right: 7, bottom: 5, left: 7 }

function install(elem, width, height) {

  // main application state

  let focus_id = null

  queue.queue()
    .defer(d3.json, WORLD_MAP)
    .defer(d3.json, DATAPOINT)
    .defer(d3.csv, FOCUS_BOUNDS)
    .await( (err, world, countries, focus_bounds) => {
      if(err) throw err

      // post-process countries dataset [ dropdown & emissions bar ]

      countries.forEach( (d) => d.id = d.iso)
      countries.sort( (a,b) => d3.ascending(a.name, b.name) )
      let root = d3.stratify()
        .id((d) => d.id || d.iso)
        .parentId((d) => d.id !== 'ROOT' ? d.parent_iso || 'ROOT' : undefined)
        (countries.concat({id:'ROOT'}))

      root.eachAfter( (d) => {
          let sum = d.children && d.children.length ? d3.sum(d.children, (v) => v.value) : 0
          d.value = Math.max(sum, d.data.emissions || 0)  // if computed value is higher use it (to fit elements visually)
        })
        .sort( (a,b) => d3.descending(a.value, b.value) )

      focus_bounds = focus_bounds.reduce( (m, d) => (m[d.iso] = [[+d.left,+d.bottom],[+d.right,+d.top]], m), {})

      // post-process map [ move laws count into GIS dataset ]

      let features = topojson.feature(world, world.objects.countries).features
      let choropleth_points = topojson.feature(world, world.objects.choropleth_points).features
      let land = topojson.feature(world, world.objects.land).features
      let borders = topojson.feature(world, world.objects.borders).features

      let by_iso = root.descendants().reduce( (m, d) => (m[d.id] = d, m), {} )
      features.forEach(merge_dataset)
      choropleth_points.forEach(merge_dataset)

      features = features.filter((d) => d.properties.laws)
      choropleth_points = choropleth_points.filter((d) => d.properties.laws)

      function merge_dataset(d) {
        if(d.id in by_iso) {
          let node = by_iso[d.id]
          Object.assign(d.properties, node.data)
          d.properties.all_ids = node.ancestors().reduce( (m, d) => (m[d.id] = true, m), {} )
          d.url = d.properties.url
        }
      }

      // visualisation

      let svg = d3.select(elem)
        .append('svg')
          .attr('class', 'map')
          .attr('width', width)
          .attr('height', height)

      let g = svg.append('g')

      let projection = geoEckert3()
        .scale(100)               // arbitrary; reqd to since unit scale causes floating point errors
        .translate([0, 0])
        .precision(.1)

      let path = d3.geoPath()
        .projection(projection)

      let sphere_bounds = path.bounds({type:'Sphere'})
      // (scale that fits entire globe to width x height)
      let sphere_scale = Math.min(width / (sphere_bounds[1][0] - sphere_bounds[0][0]),
                                  height / (sphere_bounds[1][1] - sphere_bounds[0][1]))

      let graticule = d3.geoGraticule()

      let laws_scale = d3.scaleThreshold()
        .domain([2, 5, 10, 15, 20])
        .range(scheme.schemeBlues[7].slice(1))

      let emissions_scale = d3.scaleLinear()
        .domain([0, d3.sum(countries, (d) => d.emissions)])
        .range([0, width - BAR_MARGINS.left - BAR_MARGINS.right ])

      let partition = d3.partition()
        .size([width - BAR_MARGINS.left - BAR_MARGINS.right, BAR_HEIGHT])
        .padding(0)
        .round(false)

      partition(root)

      let percent_fmt = d3.format('.1%')
      let emissions_fmt = d3.format(',.1f')

      // SVG elements

      svg.on('click', () => {
        focus(null)
      })

      // map

      g.append('path')
        .attr('class', 'map-sphere')
        .datum({type: 'Sphere'})
        .attr('d', path)

      g.append('path')
        .datum(graticule)
        .attr('class', 'map-graticule')
        .attr('d', path)

      g.append('path')
        .datum(land[0])
        .attr('class', 'map-land')
        .attr('d', path)

      let map_features = g.append('g')
          .attr('class', 'map-features')

      map_features.selectAll('.map-feature')
          .data(features)
         .enter().append('g')
          .attr('class', (d) => 'map-feature country ' + d.id)
          .append('path')
            .attr('class', 'geometry')
            .attr('d', path)
            .attr('fill', (d) => laws_scale(d.properties.laws))

      map_features.selectAll('.circles')
         .data(choropleth_points)
        .enter().append('g')
         .attr('class', (d) => '  country ' + d.id)
         .append('circle')
           .attr('class', 'geometry')
           .attr('transform', (d) => 'translate(' + path.centroid(d) + ')')
           .attr('fill', (d) => laws_scale(d.properties.laws))
           .attr('r', 10)
           .attr('stroke-width', 1.5)
           .attr('stroke', 'white')

      g.append('path')
        .datum(borders[0])
        .attr('class', 'map-borders')
        .attr('d', path)

      // map legend

      let legend_scale = d3.scaleLinear()
        .domain([0, d3.max(features, (d) => d.properties.laws)])
        .range([0, height / 2])

      let legend_axis = d3.axisRight(legend_scale)
        .tickSize(LEGEND_WIDTH+4)
        .tickValues(laws_scale.domain())

      let legend = svg.append('g')
        .attr('class', 'legend')
        .attr('transform', 'translate(' + [width - LEGEND_MARGINS.right - LEGEND_WIDTH, LEGEND_MARGINS.top] + ')')

      legend.append('rect')
        .attr('class', 'background')

      legend.append('text')
        .attr('y', '-1em')
        .attr('fill', 'black')
        .text('Laws')

      legend.selectAll('.group')
        .data(laws_scale.range().map((c) => {
          let d = laws_scale.invertExtent(c)
          if(d[0] == null) d[0] = legend_scale.domain()[0]
          if(d[1] == null) d[1] = legend_scale.domain()[1]
          return d
        }))
        .enter().append('rect')
          .attr('class', 'group')
          .attr('width', LEGEND_WIDTH)
          .attr('y', (d) => legend_scale(d[0]))
          .attr('height', (d) => legend_scale(d[1]) - legend_scale(d[0]))
          .attr('fill', (d) => laws_scale(d[0]))

      legend.call(legend_axis)

      legend.select('.domain')
        .remove()

      // emissions bar

      let emissions_bar = svg.append('g')
        .attr('class', 'emissions_bar')
        .attr('transform', 'translate(' + [ BAR_MARGINS.left, height - BAR_MARGINS.bottom - BAR_HEIGHT ] + ')')

      emissions_bar.append('rect')
        .attr('class', 'background')

      let emissions = emissions_bar.selectAll('.emissions')
            .data(root.descendants().filter((d) => d.depth > 0))
          .enter().append('g')
            .attr('class', (d) => 'emissions country ' + d.data.iso)

      emissions.append('path')
        .attr('class', 'geometry')
        .attr('d', (d) => {
          let h = BAR_HEIGHT / (d.depth + d.height)
          return 'M' + Math.round(d.x0) + ' ' + Math.round(BAR_HEIGHT - d.depth * h) +
                 'H' + Math.round(Math.max(d.x1-1, d.x0+1)) + 'v' + Math.round(h - 1) +
                 'H' + Math.round(d.x0) + 'Z'
        })

      let emissions_label = emissions.append('g')
        .attr('class', 'label')
        .attr('transform', (d) => 'translate(' + Math.min(d.x0 + 50, (d.x0 + d.x1) / 2) + ')')

      emissions_label.append('text')
        .attr('class', 'name')
        .attr('y', '-.5em')
        .attr('x', -5)
        .attr('text-anchor', 'middle')
        .text( (d) => d.data.name )

      let laws_label = emissions_label.append('text')
        .attr('y', BAR_HEIGHT)
        .attr('dy', '1.5em')

      laws_label.append('tspan')
        .attr('text-anchor', 'end')
        .attr('x', -5)
        .text( (d) => d.data.laws)

      laws_label.append('tspan')
        .attr('class', 'unit')
        .attr('text-anchor', 'start')
        .attr('x', 5)
        .text('laws')

      let raw_emissions_label = emissions_label.append('text')
        .attr('y', BAR_HEIGHT)
        .attr('dy', '2.75em')

      raw_emissions_label.append('tspan')
        .attr('text-anchor', 'end')
        .attr('x', -5)
        .text( (d) => emissions_fmt(d.data.emissions))

      raw_emissions_label.append('tspan')
        .attr('class', 'unit')
        .attr('text-anchor', 'start')
        .attr('x', 5)
        .text('MtCO2e')

      let percent_emissions_label = emissions_label.append('text')
        .attr('y', BAR_HEIGHT)
        .attr('dy', '4em')

      percent_emissions_label.append('tspan')
        .attr('text-anchor', 'end')
        .attr('x', -5)
        .text( (d) => {
          let pct = d.data.emissions / emissions_scale.domain()[1]
          return pct < 0.001 ? '≤ 0.1%' : percent_fmt(pct)
        })

      percent_emissions_label.append('tspan')
        .attr('class', 'unit')
        .attr('text-anchor', 'start')
        .attr('x', 5)
        .text('of global emissions')

      function update(sel, hover_id) {
        sel.selectAll('.map-features .country .geometry')
          // TODO move logic into a D3 selector by class?  this only goes up one level
          .attr('fill', (d) => d.properties.all_ids && d.properties.all_ids[hover_id] ? 'orange' : laws_scale(d.properties.laws))
        sel.selectAll('.emissions path')
          .attr('fill', (d) => d.id !== hover_id ? 'orange' : 'red')
        sel.selectAll('.emissions .label')
          .attr('opacity', (d) => d.id !== hover_id ? 0 : 1)
      }

      // prettify heads-up display using opacity

      d3.selectAll('rect.background').each(function() {
        let bbox = this.parentNode.getBBox()
        d3.select(this)
          .attr('x', bbox.x - BACKGROUND_MARGINS.left)
          .attr('y', bbox.y - BACKGROUND_MARGINS.top)
          .attr('width', bbox.width + BACKGROUND_MARGINS.left + BACKGROUND_MARGINS.right)
          .attr('height', bbox.height + BACKGROUND_MARGINS.top + BACKGROUND_MARGINS.bottom)
        })

      // interaction

      d3.selectAll('.country .geometry')
        .on('click', function(d) {
          focus(d.id !== focus_id ? d : null)
          d3.event.stopPropagation()
        })
        .on('mouseenter', (d) => highlight(d.id || focus_id) )
        .on('mouseleave', () => highlight(focus_id) )

      let zoom = d3.zoom()
        .translateExtent(sphere_bounds)
        .scaleExtent([sphere_scale * .95, sphere_scale * 40])
        .on('zoom', () => {
          let t = d3.event.transform
          g.attr('transform', t)
            .style('stroke-width', (1 / t.k) + 'px')
          g.selectAll('.country circle')
            .attr('r', (7.5 / t.k) + 'px')
            .style('stroke-width', (1 / t.k) + 'px')
        })

      svg.call(update, null)
         .call(zoom)
         .call(zoom.transform, zoomTransformFit())


      // HTML controls

      let dropdown = d3.select(elem)
        .append('select')
          .attr('class', 'map-select')
        .on('change', () => {
          let iso = d3.event.target.value
          focus(iso !== 'NONE' ? by_iso[iso] : null)
        })

      dropdown.selectAll('option')
           .data([null].concat(countries))
         .enter().append('option')
           .attr('value', (d) => d ? d.iso : 'NONE')
           .html((d) => d ? d.name : '...')

      let detail = d3.select(elem)
        .append('div')
          .attr('id', 'gri-detail')
          .attr('class', 'inactive')
      detail.append('div')
        .attr('class', 'close')
        .on('click', () => focus(null))
      detail.append('iframe')
        .attr('src', '')

      function focus(d) {
        // Update application state
        //   NB input object must have id & url properties
        //   NB does NOT fire a change event, so no loops
        focus_id = d ? d.id : null
        dropdown.property('value', focus_id || 'NONE')

        highlight(focus_id)

        // TODO.  simplify logic...
        let matches = features.concat(choropleth_points).filter((d) => d.properties.all_ids[focus_id])
          .map((f) => focus_bounds[f.id] ? {type: 'Feature', geometry: { type: 'MultiPoint', coordinates: focus_bounds[f.id] }} : f)
        let bounds = d3.geoBounds({type: 'FeatureCollection', features: matches})
        let zoomTransform = zoomTransformFit(focus_id ? bounds : null, zoom.scaleExtent())
        let t = svg.transition('zoom')
          .duration(2000)
          .call(zoom.transform, zoomTransform)

/*
        detail.attr('class', d && d.url ? 'active' : 'inactive')
          .select('iframe')
            .attr('src', d ? d.url : '')
*/
      }

      // utility functions

      function highlight(id) {
        svg.transition('highlight')
          .duration(500)
          .call(update, id)
      }

      function zoomTransformFit(bbox=null, scaleExtent=null) {
        let f = bbox ? {type: 'LineString', coordinates: bbox} : {type: 'Sphere'}
        let b = path.bounds(f)
        let k = 0.95 * Math.min(width / (b[1][0] - b[0][0]),
                                height / (b[1][1] - b[0][1]))

        k = scaleExtent ? Math.max(scaleExtent[0], Math.min(scaleExtent[1], k)) : k

        let x = (b[0][0] + b[1][0]) / 2
        let y = (b[0][1] + b[1][1]) / 2

        let t = d3.zoomIdentity
          .translate(width / 2 - k * x, height / 2 - k * y)
          .scale(k)

        return t
      }
    })
}

export { install }
