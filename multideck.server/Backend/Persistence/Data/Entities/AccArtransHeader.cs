using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class AccArtransHeader
{
    public Guid AccArId { get; set; }

    public int AccArNumber { get; set; }

    public Guid? AccArCustomerId { get; set; }

    public Guid? AccArCustomerAddress { get; set; }

    public int? AccArTransactionType { get; set; }

    public DateOnly AccArDate { get; set; }

    public DateOnly? AccArDueDate { get; set; }

    public Guid? AccArJobId { get; set; }

    public string? AccArModule { get; set; }

    public Guid? AccArCreatedBy { get; set; }

    public DateTime AccArCreatedDate { get; set; }

    public int? AccArCurrency { get; set; }

    public decimal? AccArRoe { get; set; }

    public decimal? AccArCurrAmount { get; set; }

    public string? AccArTaxCode { get; set; }

    public decimal? AccArCurrTaxAmount { get; set; }

    public decimal? AccArCurrGrossAmount { get; set; }

    public decimal? AccArLocalAmount { get; set; }

    public decimal? AccArLocalTaxAmount { get; set; }

    public decimal? AccArLocalGrossAmount { get; set; }

    public bool AccArPrinted { get; set; }

    public DateTime? AccArPrintedDate { get; set; }

    public Guid? AccArPrintedBy { get; set; }

    public int? AccArStatus { get; set; }

    public bool AccArFullyPaid { get; set; }

    public DateOnly? AccArPaidDate { get; set; }

    public bool AccArReversed { get; set; }

    public Guid? AccArReverseId { get; set; }

    public string? AccArReversedReason { get; set; }

    public int? AccArDocStyle { get; set; }

    public string? AccArNotes { get; set; }

    public byte[] AccArTs { get; set; } = null!;

    public virtual JobHeader? AccArJob { get; set; }

    public virtual ICollection<AccArtransLine> AccArtransLines { get; set; } = new List<AccArtransLine>();

    public virtual ICollection<AccReceiptsLine> AccReceiptsLines { get; set; } = new List<AccReceiptsLine>();
}
