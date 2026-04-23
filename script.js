const selectedSeason = "all";
let globalData;
let globalActData;
const TIMELINE_TOP_N = 15;

Promise
    .all([
        d3.csv("data/master_all_seasons.csv"),
        d3.csv("data/act_character_dataset.csv")
    ])
    .then(([lineData, actData]) => {
        lineData.forEach(d => {
            d.season = +d.season;
            d.episode = +d.episode;
        });

        actData.forEach(d => {
            d.season = +d.season;
            d.episode = +d.episode;
            d.act_number = +d.act_number;
            d.characters = parseCharactersInAct(d.characters_in_act);
        });

        globalData = lineData;
        globalActData = actData;

        initializeTimelineFilters();
        updateChart("all");

        d3.select("#seasonSelect").on("change", function () {
            const selectedSeason = this.value;
            updateChart(selectedSeason);
        });
    });

function initializeTimelineFilters() {
    const timelineSeasonSelect = d3.select("#timelineSeasonSelect");
    const timelineEpisodeSelect = d3.select("#timelineEpisodeSelect");

    const seasons = Array.from(new Set(globalActData.map(d => d.season))).sort((a, b) => a - b);

    timelineSeasonSelect.selectAll("option").remove();
    timelineSeasonSelect
        .append("option")
        .attr("value", "all")
        .text("All Seasons");

    timelineSeasonSelect
        .selectAll("option.timeline-season-option")
        .data(seasons)
        .enter()
        .append("option")
        .attr("class", "timeline-season-option")
        .attr("value", d => d)
        .text(d => `Season ${d}`);

    updateTimelineEpisodeOptions("all");

    timelineSeasonSelect.on("change", function () {
        const selectedTimelineSeason = this.value;
        updateTimelineEpisodeOptions(selectedTimelineSeason);
        renderTimelineFromFilters();
    });

    timelineEpisodeSelect.on("change", function () {
        renderTimelineFromFilters();
    });
}

function updateTimelineEpisodeOptions(selectedTimelineSeason) {
    const timelineEpisodeSelect = d3.select("#timelineEpisodeSelect");

    const sourceData = selectedTimelineSeason === "all"
        ? globalActData
        : globalActData.filter(d => d.season === +selectedTimelineSeason);

    const episodes = Array.from(new Set(sourceData.map(d => d.episode))).sort((a, b) => a - b);

    timelineEpisodeSelect.selectAll("option").remove();
    timelineEpisodeSelect
        .append("option")
        .attr("value", "all")
        .text("All Episodes");

    timelineEpisodeSelect
        .selectAll("option.timeline-episode-option")
        .data(episodes)
        .enter()
        .append("option")
        .attr("class", "timeline-episode-option")
        .attr("value", d => d)
        .text(d => `Episode ${String(d).padStart(2, "0")}`);

    timelineEpisodeSelect.property("value", "all");
}

function renderTimelineFromFilters() {
    if (!globalActData || !globalData) {
        return;
    }

    const timelineSeason = d3.select("#timelineSeasonSelect").property("value") || "all";
    const timelineEpisode = d3.select("#timelineEpisodeSelect").property("value") || "all";

    let filteredActData = globalActData;

    if (timelineSeason !== "all") {
        filteredActData = filteredActData.filter(d => d.season === +timelineSeason);
    }

    if (timelineEpisode !== "all") {
        filteredActData = filteredActData.filter(d => d.episode === +timelineEpisode);
    }

    let filteredLineData = globalData;

    if (timelineSeason !== "all") {
        filteredLineData = filteredLineData.filter(d => d.season === +timelineSeason);
    }

    if (timelineEpisode !== "all") {
        filteredLineData = filteredLineData.filter(d => d.episode === +timelineEpisode);
    }

    const timelineCharacterCounts = d3.rollups(
        filteredLineData,
        v => v.length,
        d => d.character
    );

    const timelineTopCharacters = timelineCharacterCounts
        .map(([character, count]) => ({ character, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, TIMELINE_TOP_N);

    drawActTimeline(filteredActData, timelineTopCharacters, timelineSeason);
}

function parseCharactersInAct(rawList) {
    if (!rawList) {
        return [];
    }

    const normalized = rawList
        .replace(/""/g, '"')
        .replace(/&#160;/g, " ");

    try {
        return JSON.parse(normalized)
            .map(name => String(name).trim().toUpperCase())
            .filter(Boolean);
    } catch (error) {
        return [];
    }
}

function drawBarChart(data, filteredData) {
    const svg = d3.select("#chart");
    const tooltip = d3.select("#tooltip");
    const width = 800;
    const height = 500;
    const margin = { top: 20, right: 20, bottom: 50, left: 120 };

    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;
    const episodeCounts = d3.rollups(
        filteredData,
        v => new Set(v.map(d => `${d.season}-${d.episode}`)).size,
        d => d.character
    );

    // convert to lookup object
    const episodeMap = Object.fromEntries(episodeCounts);

    svg.selectAll("*").remove(); // clear old chart

    const g = svg.append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`);

    // scales
    const x = d3.scaleLinear()
        .domain([0, d3.max(data, d => d.count) || 0])
        .nice()
        .range([0, chartWidth]);

        g.append("text")
            .attr("x", chartWidth / 2)
            .attr("y", chartHeight + 40)
            .attr("text-anchor", "middle")
            .style("font-size", "18px")
            .text("Number of Lines Spoken");

    const y = d3.scaleBand()
        .domain(data.map(d => d.character))
        .range([0, chartHeight])
        .padding(0.2);

        g.append("text")
        .attr("transform", "rotate(-90)")
        .attr("x", -chartHeight / 2)
        .attr("y", -80)
        .attr("text-anchor", "middle")
        .style("font-size", "18px")
        .text("Characters");

    // bars
    g.selectAll("rect")
        .data(data)
        .enter()
        .append("rect")
        .attr("y", d => y(d.character))
        .attr("width", d => x(d.count))
        .attr("height", y.bandwidth())
        .attr("fill", "steelblue")

    .on("mouseover", (event, d) => {
        const episodes = episodeMap[d.character] || 0;
        tooltip.style("display", "block")
            .html(`<strong>${d.character}</strong><br>
            Lines: ${d.count}<br>
            Episodes: ${episodes}`);
    })
    .on("click", (event, d) => {
        const characterData = data.filter(x => x.character === d.character);

        const perEpisode = d3.rollups(
            characterData,
            v => v.length,
            d => d.episode
        );

        console.log(perEpisode);
    })
    .on("mousemove", (event) => {
        tooltip.style("left", (event.pageX + 10) + "px")
            .style("top", (event.pageY + 10) + "px");
    })
    .on("mouseout", () => {
        tooltip.style("display", "none");
    });

    // x-axis
    g.append("g")
        .attr("transform", `translate(0,${chartHeight})`)
        .call(d3.axisBottom(x));

    // y-axis
    g.append("g")
        .call(d3.axisLeft(y));

}

function updateChart(selectedSeason) {
    let filteredData;

    if (selectedSeason === "all") {
        filteredData = globalData;
    } else {
        filteredData = globalData.filter(d => d.season === +selectedSeason);
    }

    // aggregate lines
    const characterCounts = d3.rollups(
        filteredData,
        v => v.length,
        d => d.character
    );

    const processed = characterCounts
        .map(([character, count]) => ({ character, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 15);

    drawBarChart(processed, filteredData);
    renderTimelineFromFilters();
}

function drawActTimeline(filteredActData, topCharacterData, selectedSeason) {
    const svg = d3.select("#timeline");
    const tooltip = d3.select("#tooltip");
    const width = 1000;
    const height = 520;
    const margin = { top: 25, right: 20, bottom: 110, left: 120 };

    svg.selectAll("*").remove();

    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;
    const g = svg.append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`);

    const orderedTopCharacters = topCharacterData.map(d => d.character.toUpperCase());
    const topCharacters = new Set(orderedTopCharacters);
    const filteredActs = filteredActData
        .filter(d => d.characters.some(char => topCharacters.has(char)))
        .sort((a, b) => (a.season - b.season) || (a.episode - b.episode) || (a.act_number - b.act_number));

    const actPoints = filteredActs.map((act, index) => ({
        ...act,
        actKey: `${act.season}-${act.episode}-${act.act_number}`,
        index,
        uniqueCharacters: Array.from(new Set(act.characters)).sort()
    }));

    const actKeys = actPoints.map(d => d.actKey);

    if (actKeys.length === 0) {
        g.append("text")
            .attr("x", chartWidth / 2)
            .attr("y", chartHeight / 2)
            .attr("text-anchor", "middle")
            .style("font-size", "14px")
            .text("No act-character data available for this selection.");
        return;
    }

    const timelineStartIndex = -0.2;
    const x = d3.scaleLinear()
        .domain([timelineStartIndex, Math.max(0, actKeys.length - 1)])
        .range([0, chartWidth]);

    const activeCharacters = new Set(
        filteredActs.flatMap(d => d.characters.filter(char => topCharacters.has(char)))
    );

    const yDomain = orderedTopCharacters.filter(char => activeCharacters.has(char));
    if (!yDomain.length) {
        g.append("text")
            .attr("x", chartWidth / 2)
            .attr("y", chartHeight / 2)
            .attr("text-anchor", "middle")
            .style("font-size", "14px")
            .text("No timeline characters match this season or episode selection.");
        return;
    }

    const yBase = d3.scalePoint()
        .domain(yDomain)
        .range([0, chartHeight]);

    // Characters in the same act share a y-position so lines merge.
    const mergedYByActChar = new Map();
    filteredActs.forEach(act => {
        const key = `${act.season}-${act.episode}-${act.act_number}`;
        const participants = act.characters.filter(char => topCharacters.has(char));
        if (!participants.length) {
            return;
        }

        const mergeY = d3.mean(participants, char => yBase(char));
        const sortedParticipants = participants
            .slice()
            .sort((a, b) => yBase(a) - yBase(b));

        const microOffset = 2;
        sortedParticipants.forEach((char, idx) => {
            const centeredOffset = (idx - (sortedParticipants.length - 1) / 2) * microOffset;
            mergedYByActChar.set(`${char}|${key}`, mergeY + centeredOffset);
        });
    });

    const line = d3.line()
        .x(d => x(d.index))
        .y(d => d.y)
        .curve(d3.curveMonotoneX);

    const color = d3.scaleOrdinal(d3.schemeTableau10)
        .domain(yDomain);

    yDomain.forEach(character => {
        const points = [{ actKey: "start", index: timelineStartIndex, y: yBase(character) }];

        filteredActs.forEach((act, index) => {
            const actKey = `${act.season}-${act.episode}-${act.act_number}`;
            const mergedY = mergedYByActChar.get(`${character}|${actKey}`);
            // If the character is absent in this act, return to their base lane.
            const yValue = mergedY !== undefined ? mergedY : yBase(character);

            // Keep the start anchored at the character lane, then transition into act 1.
            if (index === 0) {
                points.push({ actKey, index: 0.001, y: yValue });
            } else {
                points.push({ actKey, index, y: yValue });
            }
        });

        if (points.length < 2) {
            return;
        }

        g.append("path")
            .datum({ character, points })
            .attr("class", "timeline-path")
            .attr("fill", "none")
            .attr("stroke", color(character))
            .attr("stroke-width", 2)
            .attr("opacity", 0.9)
            .attr("d", d => line(d.points));
    });

    let hoveredCharacter = null;
    const lockedCharacters = new Set();
    let yAxisLabels = null;

    const timelinePaths = g.selectAll(".timeline-path")
        .style("cursor", "pointer")
        .on("mouseover", (event, d) => {
            hoveredCharacter = d.character;
            applyCharacterFocus();
        })
        .on("mouseout", () => {
            hoveredCharacter = null;
            applyCharacterFocus();
        });

    const getFocusedCharacters = () => {
        const focused = new Set(lockedCharacters);
        if (hoveredCharacter) {
            focused.add(hoveredCharacter);
        }
        return focused;
    };

    function applyCharacterFocus() {
        const focusedCharacters = getFocusedCharacters();
        const hasFocus = focusedCharacters.size > 0;

        timelinePaths
            .attr("opacity", d => (!hasFocus || focusedCharacters.has(d.character)) ? 0.95 : 0.14)
            .attr("stroke-width", d => (!hasFocus || focusedCharacters.has(d.character)) ? 3.2 : 1.5);

        if (yAxisLabels) {
            yAxisLabels
                .style("opacity", char => (!hasFocus || focusedCharacters.has(char)) ? 1 : 0.45)
                .style("font-weight", char => lockedCharacters.has(char) ? "700" : "400");
        }
    }

    const xAxisGroup = g.append("g")
        .attr("class", "timeline-axis")
        .attr("transform", `translate(0,${chartHeight})`);

    const hoverBandGroup = g.append("g").attr("class", "timeline-hover-bands");

    const formatActLabel = actKey => {
        const [season, episode, act] = actKey.split("-").map(Number);
        if (selectedSeason === "all") {
            return `S${season}E${String(episode).padStart(2, "0")}-A${act}`;
        }
        return `E${String(episode).padStart(2, "0")}-A${act}`;
    };

    const renderXAxis = scale => {
        const [domainMin, domainMax] = scale.domain();
        const visibleCount = Math.max(1, domainMax - domainMin + 1);
        const step = Math.max(1, Math.ceil(visibleCount / 24));
        const start = Math.max(0, Math.floor(domainMin));
        const end = Math.min(actKeys.length - 1, Math.ceil(domainMax));
        const tickIndices = [];

        for (let i = start; i <= end; i += step) {
            tickIndices.push(i);
        }

        xAxisGroup
            .call(
                d3.axisBottom(scale)
                    .tickValues(tickIndices)
                    .tickFormat(index => formatActLabel(actKeys[index]))
            )
            .selectAll("text")
            .style("text-anchor", "end")
            .attr("dx", "-0.5em")
            .attr("dy", "0.3em")
            .attr("transform", "rotate(-45)");
    };

    const renderHoverBands = scale => {
        const bands = hoverBandGroup
            .selectAll("rect")
            .data(actPoints, d => d.actKey);

        bands.enter()
            .append("rect")
            .attr("class", "timeline-hover-band")
            .attr("y", 0)
            .attr("height", chartHeight)
            .on("mouseover", (event, d) => {
                const title = selectedSeason === "all"
                    ? `S${d.season}E${String(d.episode).padStart(2, "0")} - A${d.act_number}`
                    : `E${String(d.episode).padStart(2, "0")} - A${d.act_number}`;
                tooltip
                    .style("display", "block")
                    .html(`<strong>${title}</strong><br>${d.uniqueCharacters.join(", ")}`);
            })
            .on("mousemove", event => {
                tooltip
                    .style("left", `${event.pageX + 10}px`)
                    .style("top", `${event.pageY + 10}px`);
            })
            .on("mouseout", () => {
                tooltip.style("display", "none");
            })
            .merge(bands)
            .attr("x", d => scale(d.index) - 6)
            .attr("width", 12);

        bands.exit().remove();
    };

    renderXAxis(x);
    renderHoverBands(x);
    hoverBandGroup.lower();

    const yAxisGroup = g.append("g")
        .attr("class", "timeline-axis")
        .call(d3.axisLeft(yBase));

    yAxisLabels = yAxisGroup
        .selectAll(".tick text")
        .style("cursor", "pointer")
        .on("click", (event, character) => {
            if (lockedCharacters.has(character)) {
                lockedCharacters.delete(character);
            } else {
                lockedCharacters.add(character);
            }
            hoveredCharacter = null;
            applyCharacterFocus();
        });

    applyCharacterFocus();

    const clipId = "timeline-clip";
    g.append("defs")
        .append("clipPath")
        .attr("id", clipId)
        .append("rect")
        .attr("x", 0)
        .attr("y", 0)
        .attr("width", chartWidth)
        .attr("height", chartHeight);

    g.selectAll(".timeline-path")
        .attr("clip-path", `url(#${clipId})`);

    const zoom = d3.zoom()
        .scaleExtent([1, 12])
        .translateExtent([[0, 0], [chartWidth, chartHeight]])
        .extent([[0, 0], [chartWidth, chartHeight]])
        .on("zoom", event => {
            const zoomedX = event.transform.rescaleX(x);
            const zoomedLine = line.x(point => zoomedX(point.index));
            g.selectAll(".timeline-path")
                .attr("d", d => zoomedLine(d.points));
            renderXAxis(zoomedX);
            renderHoverBands(zoomedX);
            hoverBandGroup.lower();
        });

    svg.call(zoom);

    g.append("text")
        .attr("x", chartWidth / 2)
        .attr("y", chartHeight + 95)
        .attr("text-anchor", "middle")
        .style("font-size", "14px")
        .text("Episodes and Acts");

    g.append("text")
        .attr("transform", "rotate(-90)")
        .attr("x", -chartHeight / 2)
        .attr("y", -88)
        .attr("text-anchor", "middle")
        .style("font-size", "14px")
        .text("Characters");

    svg.append("text")
        .attr("x", width / 2)
        .attr("y", 18)
        .attr("text-anchor", "middle")
        .style("font-size", "16px")
        .style("font-weight", "600")
        .text("Character Co-Appearance Timeline by Episode and Act");
}