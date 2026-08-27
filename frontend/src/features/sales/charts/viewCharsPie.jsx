import Chart from "react-apexcharts";

export default function ViewCharsPie({ title, label, data }) {
  const chartOptions = {
    chart: {
      type: "pie",
    },
    labels: label,
    legend: {
      position: "bottom",
    },
    title: {
      text: title,
      align: "center",
    },
    dataLabels: {
      enabled: true,
    },
  };

  return <Chart options={chartOptions} series={data} type="pie" height={300} />;
}
