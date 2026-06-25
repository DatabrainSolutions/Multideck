using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class AccAptransHeader
{
    public Guid AccApId { get; set; }

    public Guid AccApSupplierId { get; set; }

    public string? AccApSupplierRef { get; set; }

    public int? AccApCurrency { get; set; }

    public decimal? AccApAmount { get; set; }

    public string? AccApTaxCode { get; set; }

    public decimal? AccApTaxAmount { get; set; }

    public decimal? AccApLocalAmount { get; set; }

    public decimal? AccApLocalTaxAmount { get; set; }

    public DateOnly? AccApDate { get; set; }

    public DateOnly? AccApDueDate { get; set; }

    public int? AccApStatus { get; set; }

    public Guid? AccApCreatedBy { get; set; }

    public DateTime AccApCreatedDate { get; set; }

    public string? AccApModule { get; set; }

    public string? AccApNotes { get; set; }

    public byte[] AccApTs { get; set; } = null!;

    public Guid AccApOffice { get; set; }

    public virtual SysModule? AccApModuleNavigation { get; set; }

    public virtual OrgMaster AccApSupplier { get; set; } = null!;

    public virtual ICollection<AccAptransLine> AccAptransLines { get; set; } = new List<AccAptransLine>();
}
