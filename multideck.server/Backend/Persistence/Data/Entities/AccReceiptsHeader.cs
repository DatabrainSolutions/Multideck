using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class AccReceiptsHeader
{
    public Guid AccReceiptId { get; set; }

    public Guid AccReceiptOfficeId { get; set; }

    public Guid? AccReceiptCustomerId { get; set; }

    public DateOnly? AccReceiptRemittanceDate { get; set; }

    public DateOnly? AccReceiptReceivedDate { get; set; }

    public string? AccReceiptCustomerRef { get; set; }

    public int? AccReceiptCurrency { get; set; }

    public decimal? AccReceiptRoe { get; set; }

    public decimal? AccReceiptAmount { get; set; }

    public decimal? AccReceiptAllocatedAmount { get; set; }

    public decimal? AccReceiptAllocatedonAccount { get; set; }

    public DateTime? AccReceiptPostedToAccounts { get; set; }

    public string? AccReceiptAccountsTrxNo { get; set; }

    public string? AccReceiptNotes { get; set; }

    public Guid? AccReceiptCreatedBy { get; set; }

    public DateTime? AccReceiptCreatedDate { get; set; }

    public byte[]? AccReceiptTs { get; set; }

    public virtual ICollection<AccReceiptsLine> AccReceiptsLines { get; set; } = new List<AccReceiptsLine>();
}
