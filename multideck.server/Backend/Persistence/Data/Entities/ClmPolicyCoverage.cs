using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class ClmPolicyCoverage
{
    public Guid ClmcoverId { get; set; }

    public Guid ClmcoverPolicyId { get; set; }

    public string ClmcoverCode { get; set; } = null!;

    public string ClmcoverName { get; set; } = null!;

    public string ClmcoverCoverageTypeCode { get; set; } = null!;

    public string? ClmcoverModeCode { get; set; }

    public string? ClmcoverDirectionCode { get; set; }

    public string? ClmcoverTradeLaneCode { get; set; }

    public string? ClmcoverCommodityCode { get; set; }

    public decimal? ClmcoverMaxCargoValueAmount { get; set; }

    public decimal ClmcoverLimitAmount { get; set; }

    public decimal ClmcoverDeductibleAmount { get; set; }

    public decimal ClmcoverMinPremiumAmount { get; set; }

    public string? ClmcoverRateBasis { get; set; }

    public decimal? ClmcoverRateValue { get; set; }

    public string ClmcoverConditionsJson { get; set; } = null!;

    public bool ClmcoverIsActive { get; set; }

    public DateTime ClmcoverCreatedAt { get; set; }

    public Guid? ClmcoverCreatedBy { get; set; }

    public virtual SysClmcoverageType ClmcoverCoverageTypeCodeNavigation { get; set; } = null!;

    public virtual CmpUser? ClmcoverCreatedByNavigation { get; set; }

    public virtual ClmInsurancePolicy ClmcoverPolicy { get; set; } = null!;
}
