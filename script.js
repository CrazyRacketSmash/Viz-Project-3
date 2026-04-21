const selectedSeason = "all";
let globalData;

d3.csv("data/master_all_seasons.csv").then(data => {
    data.forEach(d => {
        d.season = +d.season;
        d.episode = +d.episode;
    });

    globalData = data;
    updateChart("all");

    d3.select("#seasonSelect").on("change", function () {
        const selectedSeason = this.value;
        updateChart(selectedSeason);
    });
});

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
}