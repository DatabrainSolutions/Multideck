using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class RptKpi
{
    public Guid RptkpiId { get; set; }

    public string RptkpiCode { get; set; } = null!;

    public string RptkpiName { get; set; } = null!;

    public string RptkpiCategoryCode { get; set; } = null!;

    public string? RptkpiModuleCode { get; set; }

    public string? RptkpiUnit { get; set; }

    public bool RptkpiHigherIsBetter { get; set; }

    public string? RptkpiDefinition { get; set; }

    public string RptkpiCalculationJson { get; set; } = null!;

    public bool RptkpiIsMvp { get; set; }

    public bool RptkpiIsActive { get; set; }

    public DateTime RptkpiCreatedAt { get; set; }

    public virtual ICollection<RptKpiresult> RptKpiresults { get; set; } = new List<RptKpiresult>();

    public virtual ICollection<RptKpitarget> RptKpitargets { get; set; } = new List<RptKpitarget>();

    public virtual SysRptmetricCategory RptkpiCategoryCodeNavigation { get; set; } = null!;

    public virtual SysSubmoduleCode? RptkpiModuleCodeNavigation { get; set; }
}
