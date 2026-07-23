using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysCustomsDeclarationStatus
{
    public string CdstCode { get; set; } = null!;

    public string CdstName { get; set; } = null!;

    public string? CdstDescription { get; set; }

    public bool CdstIsFinal { get; set; }

    public int CdstSortOrder { get; set; }

    public bool CdstIsActive { get; set; }

    public DateTime CdstCreatedAt { get; set; }

    public virtual ICollection<CdsDeclaration> CdsDeclarations { get; set; } = new List<CdsDeclaration>();

    public virtual ICollection<CdsStatusHistory> CdsStatusHistoryCdsshFromStatusNavigations { get; set; } = new List<CdsStatusHistory>();

    public virtual ICollection<CdsStatusHistory> CdsStatusHistoryCdsshToStatusNavigations { get; set; } = new List<CdsStatusHistory>();

    public virtual ICollection<CdsVersion> CdsVersions { get; set; } = new List<CdsVersion>();

    public virtual ICollection<CustomsDeclaration> CustomsDeclarations { get; set; } = new List<CustomsDeclaration>();

    public virtual ICollection<CustomsStatusHistory> CustomsStatusHistoryCustshFromStatusNavigations { get; set; } = new List<CustomsStatusHistory>();

    public virtual ICollection<CustomsStatusHistory> CustomsStatusHistoryCustshToStatusNavigations { get; set; } = new List<CustomsStatusHistory>();

    public virtual ICollection<CustomsVersion> CustomsVersions { get; set; } = new List<CustomsVersion>();

    public virtual ICollection<T1Declaration> T1Declarations { get; set; } = new List<T1Declaration>();

    public virtual ICollection<T1StatusHistory> T1StatusHistoryT1shFromStatusNavigations { get; set; } = new List<T1StatusHistory>();

    public virtual ICollection<T1StatusHistory> T1StatusHistoryT1shToStatusNavigations { get; set; } = new List<T1StatusHistory>();

    public virtual ICollection<T1Version> T1Versions { get; set; } = new List<T1Version>();
}
