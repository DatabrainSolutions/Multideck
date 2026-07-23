using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class RptKpiresult
{
    public Guid RptkpiresultId { get; set; }

    public Guid RptkpiresultKpiid { get; set; }

    public Guid? RptkpiresultOrgOfficeId { get; set; }

    public Guid? RptkpiresultLegalEntityId { get; set; }

    public Guid? RptkpiresultBrandId { get; set; }

    public DateOnly RptkpiresultPeriodStartDate { get; set; }

    public DateOnly RptkpiresultPeriodEndDate { get; set; }

    public decimal RptkpiresultValue { get; set; }

    public decimal? RptkpiresultTargetValue { get; set; }

    public string? RptkpiresultStatusCode { get; set; }

    public string RptkpiresultSourceJson { get; set; } = null!;

    public DateTime RptkpiresultCalculatedAt { get; set; }

    public virtual CmpBrand? RptkpiresultBrand { get; set; }

    public virtual RptKpi RptkpiresultKpi { get; set; } = null!;

    public virtual CmpLegalEntity? RptkpiresultLegalEntity { get; set; }

    public virtual CmpOffice? RptkpiresultOrgOffice { get; set; }
}
