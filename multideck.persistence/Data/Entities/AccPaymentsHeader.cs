using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class AccPaymentsHeader
{
    public Guid AccPaymentsId { get; set; }

    public Guid AccPaymentsOfficeId { get; set; }

    public Guid? AccPaymentsSupplierId { get; set; }

    public int AccPaymentsVisibleId { get; set; }

    public Guid? AccPaymentsAmount { get; set; }

    public int? AccPaymentsCurrency { get; set; }

    public decimal? AccPaymentsRoe { get; set; }

    public bool? AccPaymentsRemittanceSent { get; set; }

    public DateOnly? AccPaymentsRemittanceDate { get; set; }

    public DateOnly? AccPaymentsEstPaymentDate { get; set; }

    public DateOnly? AccPaymentsActualPaymentDate { get; set; }

    public string? AccPaymentsAccountsTrxNo { get; set; }

    public DateTime? AccPaymentsPostedToAccounts { get; set; }

    public DateTime? AccPaymentsCreatedDate { get; set; }

    public Guid? AccPaymentsCreatedby { get; set; }

    public byte[] AccPaymentsTs { get; set; } = null!;

    public virtual ICollection<AccPaymentsLine> AccPaymentsLines { get; set; } = new List<AccPaymentsLine>();
}
