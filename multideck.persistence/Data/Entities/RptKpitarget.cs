using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class RptKpitarget
{
    public Guid RptkpitargetId { get; set; }

    public Guid RptkpitargetKpiid { get; set; }

    public Guid? RptkpitargetOrgOfficeId { get; set; }

    public Guid? RptkpitargetLegalEntityId { get; set; }

    public Guid? RptkpitargetBrandId { get; set; }

    public decimal RptkpitargetTargetValue { get; set; }

    public string RptkpitargetPeriodCode { get; set; } = null!;

    public DateOnly RptkpitargetEffectiveFrom { get; set; }

    public DateOnly? RptkpitargetEffectiveTo { get; set; }

    public DateTime RptkpitargetCreatedAt { get; set; }

    public virtual CmpBrand? RptkpitargetBrand { get; set; }

    public virtual RptKpi RptkpitargetKpi { get; set; } = null!;

    public virtual CmpLegalEntity? RptkpitargetLegalEntity { get; set; }

    public virtual CmpOffice? RptkpitargetOrgOffice { get; set; }
}
