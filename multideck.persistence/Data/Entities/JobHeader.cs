using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class JobHeader
{
    public Guid JobId { get; set; }

    public int? JobType { get; set; }

    public int JobNumber { get; set; }

    public string JobPeriod { get; set; } = null!;

    public DateTime JobCreatedDate { get; set; }

    public Guid JobCreatedBy { get; set; }

    public DateOnly? JobRevRecognitionDate { get; set; }

    public Guid JobCustomer { get; set; }

    public Guid? JobCustomerAddress { get; set; }

    public Guid? JobShipper { get; set; }

    public Guid? JobShipperAddress { get; set; }

    public Guid? JobConsignee { get; set; }

    public Guid? JobConsigneeAddress { get; set; }

    public Guid? JobImportBroker { get; set; }

    public Guid? JobExportBroker { get; set; }

    public Guid? JobCarrier { get; set; }

    public Guid? JobSupplier { get; set; }

    public Guid JobOfficeId { get; set; }

    public virtual ICollection<AccAptransLine> AccAptransLines { get; set; } = new List<AccAptransLine>();

    public virtual ICollection<AccArtransHeader> AccArtransHeaders { get; set; } = new List<AccArtransHeader>();

    public virtual ICollection<JobCargo> JobCargos { get; set; } = new List<JobCargo>();

    public virtual ICollection<JobContainer> JobContainers { get; set; } = new List<JobContainer>();

    public virtual ICollection<JobCostingChargesIn> JobCostingChargesIns { get; set; } = new List<JobCostingChargesIn>();

    public virtual ICollection<JobCostingChargesOut> JobCostingChargesOuts { get; set; } = new List<JobCostingChargesOut>();
}
