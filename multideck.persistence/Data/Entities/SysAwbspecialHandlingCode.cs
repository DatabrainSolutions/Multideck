using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

/// <summary>
/// Starter list of AWB special handling codes, including e-AWB indicators. Reconcile to licensed IATA code lists before certification.
/// </summary>
public partial class SysAwbspecialHandlingCode
{
    public string AwbshcCode { get; set; } = null!;

    public string AwbshcName { get; set; } = null!;

    public string? AwbshcDescription { get; set; }

    public string AwbshcSource { get; set; } = null!;

    public int AwbshcSortOrder { get; set; }

    public bool AwbshcIsActive { get; set; }

    public DateTime AwbshcCreatedAt { get; set; }

    public virtual ICollection<AwbCompanyCarrierAgreement> AwbCompanyCarrierAgreements { get; set; } = new List<AwbCompanyCarrierAgreement>();

    public virtual ICollection<AwbHeader> AwbHeaders { get; set; } = new List<AwbHeader>();

    public virtual ICollection<AwbSpecialHandling> AwbSpecialHandlings { get; set; } = new List<AwbSpecialHandling>();
}
