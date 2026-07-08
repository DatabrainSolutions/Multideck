using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class RptMvpdashboardCatalog
{
    public string? DashboardCode { get; set; }

    public string? DashboardName { get; set; }

    public string? DashboardTypeCode { get; set; }

    public string? ModuleCode { get; set; }

    public string? DashboardDescription { get; set; }

    public string? MinPermissionCode { get; set; }

    public string? DefaultRefreshCode { get; set; }

    public string? WidgetCode { get; set; }

    public string? WidgetName { get; set; }

    public string? WidgetTypeCode { get; set; }

    public string? MetricCode { get; set; }

    public int? WidgetSortOrder { get; set; }
}
