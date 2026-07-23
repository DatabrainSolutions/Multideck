using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class WmsKpiresult
{
    public Guid WmskpiId { get; set; }

    public Guid? WmskpiFacilityId { get; set; }

    public Guid? WmskpiOrgOfficeId { get; set; }

    public Guid? WmskpiCustomerOrgId { get; set; }

    public DateOnly WmskpiPeriodStartDate { get; set; }

    public DateOnly WmskpiPeriodEndDate { get; set; }

    public string WmskpiMetricCode { get; set; } = null!;

    public string WmskpiMetricName { get; set; } = null!;

    public decimal WmskpiMetricValue { get; set; }

    public decimal? WmskpiTargetValue { get; set; }

    public string? WmskpiUnitCode { get; set; }

    public string? WmskpiStatusCode { get; set; }

    public string WmskpiDetailsJson { get; set; } = null!;

    public DateTime WmskpiCreatedAt { get; set; }

    public virtual OrgMaster? WmskpiCustomerOrg { get; set; }

    public virtual WmsFacility? WmskpiFacility { get; set; }

    public virtual CmpOffice? WmskpiOrgOffice { get; set; }
}
